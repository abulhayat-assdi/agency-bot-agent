import { describe, expect, it, vi } from "vitest";

import type { MetaBreakdownRow, MetaInsightRow } from "@/server/meta/types";

vi.mock("@/server/analytics/persisted/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/analytics/persisted/store")>();
  return {
    ...actual,
    findPersistedAccount: vi.fn(),
    fetchPersistedInsightRows: vi.fn(),
    fetchPersistedBreakdownRows: vi.fn(),
    fetchPersistedHierarchy: vi.fn()
  };
});

import {
  comparePersistedPeriods,
  getPersistedAccountSummary,
  getPersistedAnomalies,
  getPersistedBottomEntities,
  getPersistedBreakdown,
  getPersistedDataAvailability,
  getPersistedTopEntities,
  getPersistedTrend
} from "./service";
import {
  fetchPersistedBreakdownRows,
  fetchPersistedHierarchy,
  fetchPersistedInsightRows,
  findPersistedAccount
} from "@/server/analytics/persisted/store";

const db = {} as never;
const range = { since: "2026-09-01", until: "2026-09-07" };
const previousRange = { since: "2026-08-25", until: "2026-08-31" };

const context = {
  dbRowId: "db-account-1",
  clientId: "client-1",
  clientName: "Northstar Commerce",
  account: {
    id: "act_100000000000001",
    accountId: "100000000000001",
    name: "Northstar Commerce - BD",
    currency: "BDT",
    timezone: "Asia/Dhaka",
    accessStatus: "connected" as const
  },
  lastSyncAt: "2026-09-10T11:45:00.000Z",
  lastSyncState: "success"
};

function insightRow(overrides: Partial<MetaInsightRow> = {}): MetaInsightRow {
  return {
    accountId: context.account.id,
    level: "account",
    entityId: context.account.id,
    entityName: context.account.name,
    dateStart: "2026-09-01",
    dateStop: "2026-09-01",
    timezone: "Asia/Dhaka",
    currency: "BDT",
    attributionContext: {},
    spend: 100,
    impressions: 10000,
    reach: 8000,
    clicks: 200,
    linkClicks: 160,
    outboundClicks: 100,
    ctr: null,
    cpc: null,
    cpm: null,
    frequency: null,
    conversions: 10,
    conversionValue: 5000,
    availability: {},
    ...overrides
  };
}

describe("M5 persisted analytics service", () => {
  it("aggregates account summaries with derived ROAS and provenance", async () => {
    vi.mocked(findPersistedAccount).mockResolvedValue(context);
    vi.mocked(fetchPersistedInsightRows).mockImplementation(async (_db, query) =>
      query.range.since === range.since ? [insightRow(), insightRow({ dateStart: "2026-09-02", dateStop: "2026-09-02" })] : [insightRow({ spend: 50, conversionValue: 1000 })]
    );

    const summary = await getPersistedAccountSummary(db, context.account.id, range, previousRange);
    expect(summary?.metrics.spend.value).toBe(200);
    expect(summary?.metrics.roas.value).toBeCloseTo(2 * 5000 / 200, 4);
    expect(summary?.previousMetrics.spend.value).toBe(50);
    expect(summary?.provenance).toMatchObject({ source: "persisted", accountId: context.account.id });
    expect(summary?.context.account.currency).toBe("BDT");
  });

  it("returns null when the account has no persisted rows", async () => {
    vi.mocked(findPersistedAccount).mockResolvedValue(context);
    vi.mocked(fetchPersistedInsightRows).mockResolvedValue(null);
    expect(await getPersistedAccountSummary(db, context.account.id, range, previousRange)).toBeNull();
    expect(await getPersistedTrend(db, context.account.id, range)).toBeNull();
  });

  it("compares periods without infinity when the previous value is missing", async () => {
    vi.mocked(findPersistedAccount).mockResolvedValue(context);
    vi.mocked(fetchPersistedInsightRows).mockImplementation(async (_db, query) =>
      query.range.since === range.since ? [insightRow()] : []
    );
    const compared = await comparePersistedPeriods(db, context.account.id, range, previousRange);
    expect(compared?.comparisons.spend.percentageChange.value).toBeNull();
    expect(compared?.comparisons.spend.direction).toBe("not_comparable");
    for (const comparison of Object.values(compared?.comparisons ?? {})) {
      for (const metric of [comparison.absoluteChange, comparison.percentageChange]) {
        expect(metric.value).not.toBe(Number.POSITIVE_INFINITY);
        expect(metric.value).not.toBe(Number.NEGATIVE_INFINITY);
        expect(metric.value === null || Number.isFinite(metric.value)).toBe(true);
      }
    }
  });

  it("ranks top/bottom entities excluding unavailable metrics", async () => {
    const hierarchy = {
      campaigns: [
        { id: "c1", accountId: context.account.id, name: "Winners", status: "ACTIVE", effectiveStatus: "ACTIVE", objective: "SALES", buyingType: "AUCTION" },
        { id: "c2", accountId: context.account.id, name: "No data", status: "ACTIVE", effectiveStatus: "ACTIVE", objective: "SALES", buyingType: "AUCTION" }
      ],
      adSets: [],
      ads: []
    };
    vi.mocked(findPersistedAccount).mockResolvedValue(context);
    vi.mocked(fetchPersistedHierarchy).mockResolvedValue(hierarchy);
    vi.mocked(fetchPersistedInsightRows).mockImplementation(async (_db, query) => {
      if (query.level !== "campaign") return [];
      if (query.range.since === range.since) {
        return [insightRow({ level: "campaign", entityId: "c1", entityName: "Winners" })];
      }
      return [];
    });

    const top = await getPersistedTopEntities(db, context.account.id, "campaign", range, previousRange, "roas");
    expect(top?.entities.map((entity) => entity.id)).toEqual(["c1"]);
    const bottom = await getPersistedBottomEntities(db, context.account.id, "campaign", range, previousRange, "roas");
    expect(bottom?.entities.map((entity) => entity.id)).toEqual(["c1"]);
  });

  it("groups breakdown rows by dimension values with availability summaries", async () => {
    const breakdown = (values: Record<string, string>, spend: number): MetaBreakdownRow => ({
      ...insightRow({ spend }),
      breakdownKey: "age",
      breakdownValues: values
    });
    vi.mocked(findPersistedAccount).mockResolvedValue(context);
    vi.mocked(fetchPersistedBreakdownRows).mockResolvedValue([
      breakdown({ age: "25-34" }, 80),
      breakdown({ age: "18-24" }, 20)
    ]);

    const result = await getPersistedBreakdown(db, context.account.id, "campaign", ["age"], range);
    expect(result?.rows.map((row) => row.label)).toEqual(["25-34", "18-24"]);
    expect(result?.rows[0]?.metrics.spend.value).toBe(80);
    expect(result?.provenance.source).toBe("persisted");
  });

  it("returns structured unsupported when a breakdown was never collected", async () => {
    vi.mocked(findPersistedAccount).mockResolvedValue(context);
    vi.mocked(fetchPersistedBreakdownRows).mockResolvedValue(null);
    expect(await getPersistedBreakdown(db, context.account.id, "campaign", ["not_a_breakdown"], range)).toBeNull();
  });

  it("detects anomalies deterministically from persisted aggregates", async () => {
    vi.mocked(findPersistedAccount).mockResolvedValue(context);
    vi.mocked(fetchPersistedInsightRows).mockImplementation(async (_db, query) =>
      query.range.since === range.since ? [insightRow({ spend: 1000 })] : [insightRow({ spend: 100 })]
    );
    const result = await getPersistedAnomalies(db, context.account.id, range, previousRange);
    expect(result?.anomalies.length).toBeGreaterThan(0);
    expect(result?.anomalies[0]).toMatchObject({ severity: expect.any(String) });
  });

  it("reports data availability states instead of zeros", async () => {
    const stubDb = {
      query: {
        dataAvailability: { findMany: async () => [] }
      }
    } as never;
    const { MetricsRepository } = await import("@/server/repositories/metrics-repository");
    const spy = vi.spyOn(MetricsRepository.prototype, "dailyByEntities").mockResolvedValue([
      {
        entityKey: context.account.id,
        date: "2026-09-01",
        spend: "100",
        impressions: 1000,
        reach: null,
        clicks: 10,
        linkClicks: null,
        outboundClicks: null,
        conversions: null,
        conversionValue: null,
        availabilityState: "partial",
        sourceFields: { availability: { reach: "null_from_source", conversions: "unavailable" } }
      } as never
    ]);
    vi.mocked(findPersistedAccount).mockResolvedValue(context);
    const availability = await getPersistedDataAvailability(stubDb, context.account.id, range);
    expect(availability?.states).toContainEqual(expect.objectContaining({ metricKey: "reach", state: "null_from_source" }));
    expect(availability?.states).toContainEqual(expect.objectContaining({ metricKey: "conversions", state: "unavailable" }));
    spy.mockRestore();
  });
});
