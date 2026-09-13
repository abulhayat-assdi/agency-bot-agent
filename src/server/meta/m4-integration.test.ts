import { describe, expect, it, vi } from "vitest";

import { createGraphApiMetaAdsProvider, createMockMetaAdsProvider, fetchAllPagesBounded } from "./index";
import { GraphApiHttpClient } from "./adapters/graph-api/http-client";
import { MetaApiError, toSafeUserMessage } from "./errors";
import { sanitizeLogUrl } from "../observability/logger";
import { buildRawIngestionRecord, dedupeByKey, insightIdempotencyKey, syncAccount } from "../sync/meta-sync";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function createFetch(handler: (url: URL, init?: RequestInit) => unknown | Response) {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const result = handler(url, init);
    return result instanceof Response ? result : jsonResponse(result);
  }) as unknown as typeof fetch;
}

describe("M4 Meta error taxonomy", () => {
  it.each([
    [{ error: { message: "Invalid OAuth access token", type: "OAuthException", code: 190 } }, 400, "authentication", false],
    [{ error: { message: "Permissions error", type: "OAuthException", code: 200 } }, 400, "permission", false],
    [{ error: { message: "Rate limit", code: 4 } }, 429, "rate_limit", true],
    [{ error: { message: "Server busy", code: 2 } }, 500, "rate_limit", true],
    [{ error: { message: "Invalid parameter", code: 100 } }, 400, "invalid_request", false],
    [{ error: { message: "(#100) breakdowns are not supported for this query", code: 100 } }, 400, "unsupported_breakdown", false]
  ])("classifies %j as %s", async (body, status, kind, retryable) => {
    const fetchImpl = createFetch(() => jsonResponse(body, status));
    const client = new GraphApiHttpClient({ accessToken: "t", graphApiVersion: "v26.0", fetchImpl, maxRetries: 0, retryBaseMs: 1 });
    await expect(client.getObject("/me", {})).rejects.toMatchObject({ kind, retryable });
  });

  it("retries transient failures with bounded attempts then succeeds", async () => {
    let calls = 0;
    const fetchImpl = createFetch(() => {
      calls += 1;
      if (calls < 3) return jsonResponse({ error: { message: "busy", code: 2 } }, 500);
      return { id: "1", name: "Abul Hayat" };
    });
    const client = new GraphApiHttpClient({ accessToken: "t", graphApiVersion: "v26.0", fetchImpl, maxRetries: 3, retryBaseMs: 1 });
    const result = await client.getObject<{ id: string }>("/me", {});
    expect(result.id).toBe("1");
    expect(calls).toBe(3);
  });

  it("does not retry permission errors", async () => {
    let calls = 0;
    const fetchImpl = createFetch(() => {
      calls += 1;
      return jsonResponse({ error: { message: "denied", code: 200 } }, 400);
    });
    const client = new GraphApiHttpClient({ accessToken: "t", graphApiVersion: "v26.0", fetchImpl, maxRetries: 3, retryBaseMs: 1 });
    await expect(client.getObject("/me", {})).rejects.toBeInstanceOf(MetaApiError);
    expect(calls).toBe(1);
  });

  it("maps network failures to retryable network errors", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    const client = new GraphApiHttpClient({ accessToken: "t", graphApiVersion: "v26.0", fetchImpl, maxRetries: 0 });
    await expect(client.getObject("/me", {})).rejects.toMatchObject({ kind: "network", retryable: true });
  });

  it("returns safe user messages without secrets", () => {
    expect(toSafeUserMessage(new MetaApiError("raw", "authentication", "190", false))).toBe("Meta authentication failed.");
    expect(toSafeUserMessage(new MetaApiError("raw", "unsupported_breakdown", "x", false))).toBe("Requested breakdown combination is unsupported.");
  });
});

describe("M4 read-only guarantee", () => {
  it("performs only GET requests across provider reads", async () => {
    const methods: string[] = [];
    const fetchImpl = createFetch((url, init) => {
      methods.push(init?.method ?? "GET");
      if (url.pathname === "/v26.0/me") return { id: "u1", name: "Abul Hayat" };
      if (url.pathname === "/v26.0/me/adaccounts") return { data: [], paging: { cursors: {} } };
      if (url.pathname.endsWith("/insights")) return { data: [], paging: { cursors: {} } };
      if (url.pathname === "/v26.0/act_1") return { id: "act_1", account_id: "1", name: "A", currency: "USD", timezone_name: "UTC", account_status: 1 };
      return { data: [], paging: { cursors: {} } };
    });
    const provider = createGraphApiMetaAdsProvider({ accessToken: "t", graphApiVersion: "v26.0", fetchImpl, maxRetries: 0 });
    await provider.getCurrentUser();
    await provider.listAdAccounts();
    await provider.listCampaigns("act_1");
    await provider.listAdSets("act_1");
    await provider.listAds("act_1");
    await provider.getInsights({ accountId: "act_1", level: "account", dateRange: { since: "2026-08-14", until: "2026-09-12" } });
    expect(methods.length).toBeGreaterThan(0);
    expect(methods.every((method) => method === "GET")).toBe(true);
  });

  it("exposes no Meta write methods on the provider interface", () => {
    const provider = createMockMetaAdsProvider();
    for (const key of ["createCampaign", "updateCampaign", "deleteCampaign", "pauseAd", "updateBudget", "post", "put", "delete"]) {
      expect((provider as unknown as Record<string, unknown>)[key]).toBeUndefined();
    }
  });
});

describe("M4 logging and secret safety", () => {
  it("redacts access tokens from URLs", () => {
    const sanitized = sanitizeLogUrl("https://graph.facebook.com/v26.0/me?access_token=secret123&fields=id");
    expect(sanitized).not.toContain("secret123");
    expect(sanitized.toLowerCase()).toContain("redacted");
  });

  it("never stores tokens in raw ingestion records", () => {
    const record = buildRawIngestionRecord({
      provider: "graph-api",
      endpoint: "/act_1/insights",
      accountId: "act_1",
      requestParams: { fields: "spend", access_token: "super-secret", limit: 10 },
      apiVersion: "v26.0",
      payload: { data: [] }
    });
    expect(JSON.stringify(record)).not.toContain("super-secret");
    expect(record.payload.requestParams).not.toHaveProperty("access_token");
  });
});

describe("M4 insights normalization", () => {
  it("preserves missing metrics as null instead of zero", async () => {
    const fetchImpl = createFetch((url) => {
      if (url.pathname === "/v26.0/act_1") return { id: "act_1", account_id: "1", name: "A", currency: "USD", timezone_name: "Asia/Dhaka", account_status: 1 };
      return { data: [{ account_id: "1", date_start: "2026-09-01", date_stop: "2026-09-01", spend: "10" }], paging: { cursors: {} } };
    });
    const provider = createGraphApiMetaAdsProvider({ accessToken: "t", graphApiVersion: "v26.0", fetchImpl, maxRetries: 0 });
    const page = await provider.getInsights({ accountId: "act_1", level: "account", dateRange: { since: "2026-09-01", until: "2026-09-01" } });
    expect(page.data[0]?.spend).toBe(10);
    expect(page.data[0]?.impressions).toBeNull();
    expect(page.data[0]?.availability.impressions).toBe("null_from_source");
    expect(page.data[0]?.conversions).toBeNull();
  });

  it("rejects unsupported breakdown combinations explicitly", async () => {
    const provider = createMockMetaAdsProvider();
    const account = (await provider.listAdAccounts({ limit: 1 })).data[0];
    await expect(
      provider.getBreakdowns({ accountId: account.id, level: "account", dateRange: { since: "2026-09-01", until: "2026-09-01" }, breakdowns: ["age", "publisher_platform"] })
    ).rejects.toMatchObject({ kind: "unsupported_breakdown" });
  });

  it("returns structured unsupported for unknown graph breakdowns without calling Meta", async () => {
    const fetchImpl = createFetch(() => ({ data: [], paging: { cursors: {} } }));
    const provider = createGraphApiMetaAdsProvider({ accessToken: "t", graphApiVersion: "v26.0", fetchImpl: vi.fn(fetchImpl) as unknown as typeof fetch, maxRetries: 0 });
    await expect(
      provider.getBreakdowns({ accountId: "act_1", level: "campaign", dateRange: { since: "2026-09-01", until: "2026-09-01" }, breakdowns: ["not_a_breakdown"] })
    ).rejects.toMatchObject({ kind: "unsupported_breakdown", retryable: false });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("M4 pagination and idempotency", () => {
  it("bounds pagination to avoid infinite loops", async () => {
    const result = await fetchAllPagesBounded(
      async (paging) => ({ data: [{ id: 1 }], paging: { cursors: { after: paging?.after ? undefined : "cursor-1" }, next: paging?.after ? undefined : "next" } }),
      { maxPages: 3, pageSize: 10 }
    );
    expect(result.truncated).toBe(false);
    expect(result.rows).toHaveLength(2);
  });

  it("truncates runaway cursors at the safety bound", async () => {
    const result = await fetchAllPagesBounded(
      async () => ({ data: [{ id: 1 }], paging: { cursors: { after: "always" }, next: "always" } }),
      { maxPages: 3, pageSize: 10 }
    );
    expect(result.truncated).toBe(true);
    expect(result.pagesFetched).toBe(3);
  });

  it("produces stable idempotency keys and dedupes repeats", () => {
    const row = { accountId: "act_1", level: "campaign", entityId: "c1", dateStart: "2026-09-01", dateStop: "2026-09-01" };
    expect(insightIdempotencyKey(row as never)).toBe(insightIdempotencyKey(row as never));
    expect(dedupeByKey([row, { ...row }] as never[], insightIdempotencyKey as never)).toHaveLength(1);
  });
});

describe("M4 provider capabilities and sync flow", () => {
  it("exposes current user, single account/ad lookup, breakdowns, and health", async () => {
    const provider = createMockMetaAdsProvider();
    expect((await provider.getCurrentUser()).name).toBeTruthy();
    const account = (await provider.listAdAccounts({ limit: 1 })).data[0];
    expect(await provider.getAdAccount(account.id)).toMatchObject({ id: account.id });
    expect(await provider.getAdAccount("act_missing_xyz")).toBeNull();
    const ads = await provider.listAds(account.id, undefined, { limit: 1 });
    expect(await provider.getAd(account.id, ads.data[0].id)).toMatchObject({ id: ads.data[0].id });
    expect((await provider.getAvailableBreakdowns("campaign")).length).toBeGreaterThan(5);
    expect((await provider.healthCheck()).status).toBe("connected");
  });

  it("runs the staged sync flow with raw envelopes and availability tracking", async () => {
    const provider = createMockMetaAdsProvider();
    const account = (await provider.listAdAccounts({ limit: 1 })).data[0];
    const upserts = { accounts: 0, insights: 0, breakdowns: 0 };
    const result = await syncAccount(
      provider,
      account.id,
      { since: "2026-09-01", until: "2026-09-02" },
      {
        upsertAccount: async () => {
          upserts.accounts += 1;
        },
        upsertInsights: async () => {
          upserts.insights += 1;
        },
        upsertBreakdowns: async () => {
          upserts.breakdowns += 1;
        }
      },
      { providerName: "mock", apiVersion: "v26.0", includeBreakdowns: true }
    );
    expect(result.account?.id).toBe(account.id);
    expect(result.stages.map((stage) => stage.stage)).toContain("validate_connection");
    expect(result.stages.map((stage) => stage.stage)).toContain("fetch_campaigns");
    expect(result.rawRecords.length).toBeGreaterThan(0);
    expect(JSON.stringify(result)).not.toContain("super-secret");
    expect(upserts.accounts).toBe(1);
  });
});
