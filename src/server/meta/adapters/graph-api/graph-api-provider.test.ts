import { describe, expect, it, vi } from "vitest";

import { MetaApiError } from "@/server/meta/errors";
import { createGraphApiMetaAdsProvider } from "@/server/meta";

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
}

function createFetch(handler: (url: URL) => unknown | Response) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const result = handler(url);
    return result instanceof Response ? result : jsonResponse(result);
  }) as unknown as typeof fetch;
}

describe("GraphApiMetaAdsProvider", () => {
  it("lists ad accounts using read-only Graph API fields without exposing access token in logs", async () => {
    const fetchImpl = createFetch((url) => {
      expect(url.pathname).toBe("/v26.0/me/adaccounts");
      expect(url.searchParams.get("fields")).toContain("timezone_name");
      expect(url.searchParams.get("access_token")).toBe("test-token");
      expect(url.searchParams.get("appsecret_proof")).toMatch(/^[a-f0-9]{64}$/);
      return {
        data: [
          {
            id: "act_123",
            account_id: "123",
            name: "Live Account",
            currency: "BDT",
            timezone_name: "Asia/Dhaka",
            account_status: 1
          }
        ],
        paging: { cursors: { after: "cursor-2" }, next: "next-url" }
      };
    });

    const provider = createGraphApiMetaAdsProvider({ accessToken: "test-token", appSecret: "app-secret", graphApiVersion: "v26.0", fetchImpl });
    const accounts = await provider.listAdAccounts({ limit: 25 });

    expect(accounts.data[0]).toEqual({
      id: "act_123",
      accountId: "123",
      name: "Live Account",
      currency: "BDT",
      timezone: "Asia/Dhaka",
      accessStatus: "connected"
    });
    expect(accounts.paging.cursors.after).toBe("cursor-2");
  });

  it("normalizes insight rows while preserving null conversion states", async () => {
    const fetchImpl = createFetch((url) => {
      if (url.pathname === "/v26.0/act_123") {
        return { id: "act_123", account_id: "123", name: "Live Account", currency: "BDT", timezone_name: "Asia/Dhaka", account_status: 1 };
      }
      expect(url.pathname).toBe("/v26.0/act_123/insights");
      expect(url.searchParams.get("level")).toBe("campaign");
      expect(url.searchParams.get("time_range")).toBe(JSON.stringify({ since: "2026-09-04", until: "2026-09-10" }));
      return {
        data: [
          {
            account_id: "123",
            campaign_id: "cmp_1",
            campaign_name: "Campaign One",
            date_start: "2026-09-04",
            date_stop: "2026-09-04",
            spend: "120.50",
            impressions: "1000",
            reach: "900",
            clicks: "25",
            inline_link_clicks: "20"
          }
        ],
        paging: { cursors: {} }
      };
    });

    const provider = createGraphApiMetaAdsProvider({ accessToken: "test-token", graphApiVersion: "v26.0", fetchImpl });
    const page = await provider.getInsights({ accountId: "act_123", level: "campaign", dateRange: { since: "2026-09-04", until: "2026-09-10" }, timeIncrement: 1 });

    expect(page.data[0]).toMatchObject({
      accountId: "act_123",
      entityId: "cmp_1",
      entityName: "Campaign One",
      spend: 120.5,
      impressions: 1000,
      conversions: null,
      currency: "BDT",
      timezone: "Asia/Dhaka"
    });
    expect(page.data[0]?.availability.conversions).toBe("null_from_source");
  });

  it("maps breakdown values from Graph API rows", async () => {
    const fetchImpl = createFetch((url) => {
      if (url.pathname === "/v26.0/act_123") {
        return { id: "act_123", account_id: "123", name: "Live Account", currency: "USD", timezone_name: "UTC", account_status: 1 };
      }
      expect(url.searchParams.get("breakdowns")).toBe("age,gender");
      return {
        data: [
          {
            account_id: "123",
            campaign_id: "cmp_1",
            campaign_name: "Campaign One",
            date_start: "2026-09-04",
            date_stop: "2026-09-04",
            spend: "1",
            impressions: "10",
            clicks: "1",
            age: "25-34",
            gender: "female"
          }
        ],
        paging: { cursors: {} }
      };
    });

    const provider = createGraphApiMetaAdsProvider({ accessToken: "test-token", graphApiVersion: "v26.0", fetchImpl });
    const page = await provider.getBreakdowns({ accountId: "act_123", level: "campaign", breakdowns: ["age", "gender"], dateRange: { since: "2026-09-04", until: "2026-09-10" } });

    expect(page.data[0]?.breakdownKey).toBe("age,gender");
    expect(page.data[0]?.breakdownValues).toEqual({ age: "25-34", gender: "female" });
  });

  it("classifies Graph API permission errors as non-retryable MetaApiError", async () => {
    const fetchImpl = createFetch(() =>
      jsonResponse(
        {
          error: {
            message: "Permissions error",
            type: "OAuthException",
            code: 200,
            fbtrace_id: "trace-id"
          }
        },
        400
      )
    );

    const provider = createGraphApiMetaAdsProvider({ accessToken: "test-token", graphApiVersion: "v26.0", fetchImpl });

    await expect(provider.listAdAccounts()).rejects.toMatchObject({
      name: "MetaApiError",
      kind: "permission",
      retryable: false,
      code: "200"
    } satisfies Partial<MetaApiError>);
  });
});
