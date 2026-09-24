import { aggregateSourceMetrics } from "@/server/analytics/metrics/aggregate";
import type { AnalyticsMetricSet } from "@/server/analytics";
import {
  fetchPersistedBreakdownRows,
  findPersistedAccount,
  getAnalyticsDb,
  isMockFallbackAllowed,
  listPersistedAccounts,
  NoAdAccountsError
} from "@/server/analytics/persisted/store";
import { createMockMetaAdsProvider, MetaApiError, type MetaAdAccount, type MetaBreakdownRow, type MetaEntityLevel } from "@/server/meta";
import { resolveDatePreset, type DateRangePreset, type ReportingDateRange } from "@/lib/dates/reporting";
import { breakdownCapabilities, validateBreakdownRequest, type BreakdownCapability } from "@/server/breakdowns/capabilities";

export type BreakdownQuery = {
  accountId?: string;
  level?: MetaEntityLevel;
  entityId?: string;
  preset?: DateRangePreset;
  breakdownKey?: string;
};

export type BreakdownResultRow = {
  label: string;
  values: Record<string, string>;
  metrics: AnalyticsMetricSet;
  availabilitySummary: string[];
};

export type BreakdownDashboardData = {
  accounts: MetaAdAccount[];
  selectedAccount: MetaAdAccount;
  range: ReportingDateRange;
  level: MetaEntityLevel;
  entityId: string;
  selectedCapability: BreakdownCapability;
  capabilities: BreakdownCapability[];
  rows: BreakdownResultRow[];
  unsupportedExamples: Array<{ key: string; label: string; reason: string }>;
  source: "persisted" | "mock";
  caveats: string[];
};

async function fetchAllPages<T>(fetchPage: (after?: string) => Promise<{ data: T[]; paging: { cursors: { after?: string } } }>) {
  const rows: T[] = [];
  let after: string | undefined;
  do {
    const page = await fetchPage(after);
    rows.push(...page.data);
    after = page.paging.cursors.after;
  } while (after);
  return rows;
}

function groupBy<T>(items: T[], key: (item: T) => string) {
  return items.reduce<Record<string, T[]>>((groups, item) => {
    const groupKey = key(item);
    groups[groupKey] = [...(groups[groupKey] ?? []), item];
    return groups;
  }, {});
}

function rowToInput(row: MetaBreakdownRow) {
  return {
    spend: row.spend,
    impressions: row.impressions,
    reach: row.reach,
    clicks: row.clicks,
    linkClicks: row.linkClicks,
    outboundClicks: row.outboundClicks,
    conversions: row.conversions,
    conversionValue: row.conversionValue,
    availability: row.availability
  };
}

function summarizeAvailability(rows: MetaBreakdownRow[]) {
  const states = new Set<string>();
  for (const row of rows) {
    Object.entries(row.availability).forEach(([metric, state]) => {
      if (state && state !== "available") states.add(`${metric}: ${state}`);
    });
  }
  return [...states].sort();
}

function normalizePreset(value: DateRangePreset | undefined): DateRangePreset {
  return value ?? "last_7_days";
}

function normalizeLevel(value: MetaEntityLevel | undefined): MetaEntityLevel {
  return value ?? "account";
}

async function loadPersistedAccounts(): Promise<Map<string, { account: MetaAdAccount; lastSyncAt: string | null }> | null> {
  const db = getAnalyticsDb();
  if (!db) return null;
  try {
    const contexts = await listPersistedAccounts(db);
    return contexts ? new Map(contexts.map((context) => [context.account.id, { account: context.account, lastSyncAt: context.lastSyncAt }])) : null;
  } catch {
    return null;
  }
}

async function fetchBreakdownRows(
  selectedAccount: MetaAdAccount,
  level: MetaEntityLevel,
  entityId: string,
  range: ReportingDateRange,
  dimensions: string[],
  persistedOnly: boolean
): Promise<{ rows: MetaBreakdownRow[]; source: "persisted" | "mock" }> {
  const db = getAnalyticsDb();
  if (db) {
    try {
      const context = await findPersistedAccount(db, selectedAccount.id);
      if (context) {
        const rows = await fetchPersistedBreakdownRows(db, {
          accountDbId: context.dbRowId,
          account: context.account,
          level,
          breakdowns: dimensions,
          range,
          entityKeys: level === "account" ? undefined : [entityId]
        });
        if (rows) return { rows, source: "persisted" };
        // A synced breakdown stays missing rather than mock-filled.
        if (persistedOnly) return { rows: [], source: "persisted" };
      }
    } catch {
      // Fall through to the mock provider.
    }
  }
  if (persistedOnly || !isMockFallbackAllowed()) return { rows: [], source: "persisted" };
  const provider = createMockMetaAdsProvider();
  const rows = await fetchAllPages<MetaBreakdownRow>((after) =>
    provider.getBreakdowns({
      accountId: selectedAccount.id,
      level,
      entityIds: level === "account" ? undefined : [entityId],
      dateRange: range,
      breakdowns: dimensions,
      limit: 100,
      after
    })
  );
  return { rows, source: "mock" };
}

export async function getBreakdownDashboardData(query: BreakdownQuery = {}): Promise<BreakdownDashboardData> {
  const allowMock = isMockFallbackAllowed();
  const provider = createMockMetaAdsProvider();
  const mockAccounts = allowMock ? await fetchAllPages<MetaAdAccount>((after) => provider.listAdAccounts({ limit: 100, after })) : [];
  const persistedAccounts = await loadPersistedAccounts();
  const accounts = persistedAccounts ? [...persistedAccounts.values()].map((entry) => entry.account) : mockAccounts;
  const selectedAccount = accounts.find((account) => account.id === query.accountId) ?? accounts[0];

  if (!selectedAccount) {
    throw new NoAdAccountsError("breakdown analysis");
  }

  const persistedOnly = !allowMock || Boolean(persistedAccounts?.get(selectedAccount.id)?.lastSyncAt);
  const level = normalizeLevel(query.level);
  const entityId = query.entityId ?? selectedAccount.id;
  const referenceNow = persistedOnly ? new Date() : new Date("2026-09-10T12:00:00.000Z");
  const range = resolveDatePreset(normalizePreset(query.preset), selectedAccount.timezone, referenceNow);
  const requestedKey = query.breakdownKey ?? "age,gender";
  const validation = validateBreakdownRequest(requestedKey, level);
  const selectedCapability = validation.supported && validation.capability ? validation.capability : breakdownCapabilities.find((capability) => capability.key === "age,gender")!;

  const { rows: breakdownRows, source } = await fetchBreakdownRows(selectedAccount, level, entityId, range, selectedCapability.dimensions, persistedOnly);

  const groupedRows = Object.entries(groupBy(breakdownRows, (row) => JSON.stringify(row.breakdownValues))).map(([valuesJson, rows]) => {
    const values = JSON.parse(valuesJson) as Record<string, string>;
    return {
      label: Object.values(values).join(" / "),
      values,
      metrics: aggregateSourceMetrics(rows.map(rowToInput)),
      availabilitySummary: summarizeAvailability(rows)
    };
  });

  const unsupportedExamples = breakdownCapabilities
    .filter((capability) => !capability.supported)
    .map((capability) => ({ key: capability.key, label: capability.label, reason: capability.notes.join(" ") }));

  // Exercise invalid-combination handling so UI/docs can reference a deterministic reason without making the page fail.
  try {
    await provider.getBreakdowns({
      accountId: selectedAccount.id,
      level,
      dateRange: range,
      breakdowns: ["age", "publisher_platform"],
      limit: 1
    });
  } catch (error) {
    if (error instanceof MetaApiError) {
      unsupportedExamples.push({ key: "age,publisher_platform", label: "Age × Publisher Platform", reason: error.message });
    }
  }

  return {
    accounts,
    selectedAccount,
    range,
    level,
    entityId,
    selectedCapability,
    capabilities: breakdownCapabilities,
    rows: groupedRows.sort((a, b) => (b.metrics.spend.value ?? 0) - (a.metrics.spend.value ?? 0)),
    unsupportedExamples,
    source,
    caveats: [
      source === "persisted"
        ? "Breakdown data reads persisted PostgreSQL rows; uncollected breakdowns stay missing, never mock-filled."
        : "No persisted data exists for this account, so breakdowns use deterministic mock Meta data.",
      "Meta breakdown values may be estimated or conditionally unavailable; the UI surfaces limitations instead of hiding them.",
      "Hourly reports intentionally mark reach and frequency as unsupported instead of presenting provider zeros.",
      `Timezone shown for this analysis: ${selectedAccount.timezone}. Currency: ${selectedAccount.currency}.`
    ]
  };
}
