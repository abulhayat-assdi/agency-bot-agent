import { createHmac } from "node:crypto";

import { MetaApiError, type MetaApiErrorKind } from "@/server/meta/errors";
import { logger } from "@/server/observability/logger";
import type { GraphApiErrorBody, GraphApiPage } from "@/server/meta/adapters/graph-api/types";

export type GraphApiHttpClientOptions = {
  accessToken: string;
  appSecret?: string;
  graphApiVersion: string;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
  retryBaseMs?: number;
};

const RETRYABLE_ERROR_CODES = new Set([1, 2, 4, 17, 341, 368, 80000, 80001]);
const PERMISSION_ERROR_CODES = new Set([3, 10, 200, 294, 298]);
const AUTH_ERROR_CODES = new Set([102, 190, 191, 10200]);
const UNSUPPORTED_BREAKDOWN_SUBCODES = new Set([10554, 100, 10555]);

function classifyError(code?: number, subcode?: number, type?: string, httpStatus?: number): { kind: MetaApiErrorKind; retryable: boolean } {
  if (code && AUTH_ERROR_CODES.has(code)) return { kind: "authentication", retryable: false };
  if (type === "OAuthException" && (code === 190 || code === 102)) return { kind: "authentication", retryable: false };
  if (code && PERMISSION_ERROR_CODES.has(code)) return { kind: "permission", retryable: false };
  if (code === 200 || code === 10) return { kind: "permission", retryable: false };
  if (httpStatus === 401 || httpStatus === 403) return { kind: "permission", retryable: false };
  if (httpStatus === 429) return { kind: "rate_limit", retryable: true };
  if (subcode && UNSUPPORTED_BREAKDOWN_SUBCODES.has(subcode)) {
    // Only call it unsupported_breakdown when message also suggests breakdowns; caller refines.
    return { kind: "invalid_request", retryable: false };
  }
  if (code && RETRYABLE_ERROR_CODES.has(code)) return { kind: "rate_limit", retryable: true };
  if (httpStatus !== undefined && httpStatus >= 500 && httpStatus < 600) return { kind: "transient", retryable: true };
  if (code === 100) return { kind: "invalid_request", retryable: false };
  if (code === 803 || code === 80300) return { kind: "not_found", retryable: false };
  if (httpStatus === 404) return { kind: "not_found", retryable: false };
  if (httpStatus !== undefined && httpStatus >= 400 && httpStatus < 500) return { kind: "invalid_request", retryable: false };
  return { kind: "transient", retryable: true };
}

export function isUnsupportedBreakdownMessage(message?: string) {
  if (!message) return false;
  const normalized = message.toLowerCase();
  return normalized.includes("breakdown") && (normalized.includes("not supported") || normalized.includes("invalid") || normalized.includes("cannot be") || normalized.includes("unsupported"));
}

/** Honor Retry-After when Meta sends one (seconds or HTTP date); undefined otherwise. */
export function parseRetryAfterMs(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  const date = Date.parse(value);
  if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  return undefined;
}

function safePath(path: string) {
  return path.startsWith("/") ? path : `/${path}`;
}

export class GraphApiHttpClient {
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;

  constructor(private readonly options: GraphApiHttpClientOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.baseUrl = options.baseUrl ?? "https://graph.facebook.com";
  }

  private appSecretProof() {
    if (!this.options.appSecret) return undefined;
    return createHmac("sha256", this.options.appSecret).update(this.options.accessToken).digest("hex");
  }

  private async request<T>(path: string, params: Record<string, string | number | boolean | undefined> = {}): Promise<T> {
    const maxRetries = Math.max(0, Math.min(this.options.maxRetries ?? 3, 5));
    const baseMs = this.options.retryBaseMs ?? 400;
    let lastError: unknown = null;

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      try {
        return await this.singleRequest<T>(path, params);
      } catch (error) {
        lastError = error;
        if (!(error instanceof MetaApiError) || !error.retryable || attempt === maxRetries) throw error;
        const backoffMs = Math.min(baseMs * 2 ** attempt, 8000) + Math.floor(Math.random() * 150);
        logger.warn("Meta Graph API retryable failure, backing off", {
          path: safePath(path),
          kind: error.kind,
          code: error.code,
          attempt: attempt + 1,
          backoffMs
        });
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }

    throw lastError;
  }

  private async singleRequest<T>(path: string, params: Record<string, string | number | boolean | undefined> = {}): Promise<T> {
    const requestId = crypto.randomUUID();
    const url = new URL(`${this.baseUrl}/${this.options.graphApiVersion}${safePath(path)}`);
    const sanitizedParams: Record<string, string> = {};

    for (const [key, value] of Object.entries(params)) {
      if (value === undefined) continue;
      url.searchParams.set(key, String(value));
      sanitizedParams[key] = String(value);
    }
    url.searchParams.set("access_token", this.options.accessToken);
    const appSecretProof = this.appSecretProof();
    if (appSecretProof) url.searchParams.set("appsecret_proof", appSecretProof);

    logger.info("Meta Graph API read request", {
      requestId,
      path: safePath(path),
      fields: sanitizedParams.fields ?? null,
      hasBreakdowns: Boolean(sanitizedParams.breakdowns),
      limit: sanitizedParams.limit ?? null
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 30_000);
    let response: Response;
    try {
      response = await this.fetchImpl(url, { method: "GET", signal: controller.signal });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new MetaApiError("Meta Graph API request timed out", "transient", "timeout", true, { requestId, path: safePath(path) });
      }
      if (error instanceof TypeError || error instanceof Error) {
        throw new MetaApiError("Meta Graph API network error", "network", "network_error", true, { requestId, path: safePath(path) });
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }

    const body = (await response.json().catch(() => ({}))) as T & GraphApiErrorBody;

    if (!response.ok || body.error) {
      const graphError = body.error;
      const classified = classifyError(graphError?.code, graphError?.error_subcode, graphError?.type, response.status);
      let kind = classified.kind;
      const retryable = classified.retryable;
      if (kind === "invalid_request" && isUnsupportedBreakdownMessage(graphError?.message)) {
        kind = "unsupported_breakdown";
      }
      throw new MetaApiError(graphError?.message ?? `Meta Graph API request failed with status ${response.status}`, kind, String(graphError?.code ?? response.status), retryable, {
        requestId,
        path: safePath(path),
        fbtraceId: graphError?.fbtrace_id,
        subcode: graphError?.error_subcode,
        userTitle: graphError?.error_user_title,
        retryAfterMs: parseRetryAfterMs(response.headers.get("retry-after"))
      });
    }

    const maybePage = body as GraphApiPage<unknown>;
    logger.info("Meta Graph API read response", {
      requestId,
      path: safePath(path),
      rowCount: Array.isArray(maybePage.data) ? maybePage.data.length : 1,
      hasNextPage: Boolean(maybePage.paging?.next),
      insightsThrottle: response.headers.get("x-fb-ads-insights-throttle") ? "present" : null,
      adAccountUsage: response.headers.get("x-ad-account-usage") ? "present" : null
    });

    return body;
  }

  async getPage<T>(path: string, params: Record<string, string | number | boolean | undefined> = {}): Promise<GraphApiPage<T>> {
    const body = await this.request<GraphApiPage<T>>(path, params);
    return {
      data: body.data ?? [],
      paging: body.paging ?? { cursors: {} }
    };
  }

  async getObject<T>(path: string, params: Record<string, string | number | boolean | undefined> = {}): Promise<T> {
    return this.request<T>(path, params);
  }
}
