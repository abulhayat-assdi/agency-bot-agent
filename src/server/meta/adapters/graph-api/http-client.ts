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
};

const RETRYABLE_ERROR_CODES = new Set([1, 2, 4, 17, 341, 368]);
const PERMISSION_ERROR_CODES = new Set([3, 10, 190, 200]);

function classifyError(code?: number, type?: string): { kind: MetaApiErrorKind; retryable: boolean } {
  if (code && PERMISSION_ERROR_CODES.has(code)) return { kind: "permission", retryable: false };
  if (type === "OAuthException" && code !== 1 && code !== 2 && code !== 4 && code !== 17) return { kind: "permission", retryable: false };
  if (code && RETRYABLE_ERROR_CODES.has(code)) return { kind: "rate_limit", retryable: true };
  if (code === 100) return { kind: "invalid_request", retryable: false };
  return { kind: "transient", retryable: true };
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
      throw error;
    } finally {
      clearTimeout(timeout);
    }

    const body = (await response.json().catch(() => ({}))) as T & GraphApiErrorBody;

    if (!response.ok || body.error) {
      const graphError = body.error;
      const { kind, retryable } = classifyError(graphError?.code, graphError?.type);
      throw new MetaApiError(graphError?.message ?? `Meta Graph API request failed with status ${response.status}`, kind, String(graphError?.code ?? response.status), retryable, {
        requestId,
        path: safePath(path),
        fbtraceId: graphError?.fbtrace_id,
        subcode: graphError?.error_subcode,
        userTitle: graphError?.error_user_title
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
