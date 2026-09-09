import { detectAnomalies, toAnalyticsMetricSet, type AnalyticsMetricSet } from "@/server/analytics";
import { aggregateSourceMetrics } from "@/server/analytics/metrics/aggregate";
import { createMockMetaAdsProvider } from "@/server/meta";
import type { MetaAdAccount, MetaInsightRow } from "@/server/meta";
import { previousEquivalentPeriod, resolveDatePreset, type DateRangePreset, type ReportingDateRange } from "@/lib/dates/reporting";

export type DashboardClient = {
  id: string;
  name: string;
  status: "active" | "paused";
  accountIds: string[];
};

export type DashboardFilters = {
  preset: DateRangePreset;
  clientId?: string;
  accountId?: string;
};

export type CurrencySummary = {
  currency: string;
  metrics: AnalyticsMetricSet;
  previousMetrics: AnalyticsMetricSet;
  anomalies: ReturnType<typeof detectAnomalies>;
};

export type AccountSummary = {
  account: MetaAdAccount;
  client: DashboardClient;
  metrics: AnalyticsMetricSet;
  previousMetrics: AnalyticsMetricSet;
  lastSyncAt: string;
  freshnessState: "fresh" | "stale";
};

export type CampaignSummary = {
  id: string;
  name: string;
  accountId: string;
  accountName: string;
  clientName: string;
  currency: string;
  metrics: AnalyticsMetricSet;
};

export type TrendPoint = {
  date: string;
  impressions: number;
  clicks: number;
  conversions: number;
};

export type DashboardData = {
  generatedAt: string;
  range: ReportingDateRange;
  previousRange: ReportingDateRange;
  clients: DashboardClient[];
  accounts: MetaAdAccount[];
  selectedAccounts: MetaAdAccount[];
  accountSummaries: AccountSummary[];
  deliveryMetrics: AnalyticsMetricSet;
  currencySummaries: CurrencySummary[];
  campaignSummaries: CampaignSummary[];
  trend: TrendPoint[];
  totals: {
    clients: number;
    connectedAccounts: number;
    selectedAccounts: number;
  };
  caveats: string[];
};

export const dashboardClients: DashboardClient[] = [
  {
    id: "northstar-commerce",
    name: "Northstar Commerce",
    status: "active",
    accountIds: ["act_100000000000001"]
  },
  {
    id: "studio-atlas",
    name: "Studio Atlas",
    status: "active",
    accountIds: ["act_200000000000002"]
  }
];

function clientForAccount(accountId: string) {
  return dashboardClients.find((client) => client.accountIds.includes(accountId)) ?? dashboardClients[0];
}

function normalizePreset(value: string | undefined): DateRangePreset {
  const allowed: DateRangePreset[] = [
    "today",
    "yesterday",
    "last_3_days",
    "last_7_days",
    "last_14_days",
    "last_28_days",
    "last_30_days",
    "this_month",
    "last_month"
  ];
  return allowed.includes(value as DateRangePreset) ? (value as DateRangePreset) : "last_7_days";
}

export function parseDashboardFilters(searchParams: Record<string, string | string[] | undefined> = {}): DashboardFilters {
  const get = (key: string) => {
    const value = searchParams[key];
    return Array.isArray(value) ? value[0] : value;
  };

  return {
    preset: normalizePreset(get("preset")),
    clientId: get("clientId") || undefined,
    accountId: get("accountId") || undefined
  };
}

function getPrimaryTimezone(accounts: MetaAdAccount[]) {
  return accounts[0]?.timezone ?? "Asia/Dhaka";
}

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

async function getRowsForRange(accountId: string, range: ReportingDateRange, level: "account" | "campaign") {
  const provider = createMockMetaAdsProvider();
  return fetchAllPages<MetaInsightRow>((after) =>
    provider.getInsights({ accountId, level, dateRange: range, limit: 100, after })
  );
}

function aggregateRows(rows: MetaInsightRow[]) {
  return aggregateSourceMetrics(
    rows.map((row) => ({
      spend: row.spend,
      impressions: row.impressions,
      reach: row.reach,
      clicks: row.clicks,
      linkClicks: row.linkClicks,
      outboundClicks: row.outboundClicks,
      conversions: row.conversions,
      conversionValue: row.conversionValue,
      availability: row.availability
    }))
  );
}

function groupBy<T>(items: T[], key: (item: T) => string) {
  return items.reduce<Record<string, T[]>>((groups, item) => {
    const groupKey = key(item);
    groups[groupKey] = [...(groups[groupKey] ?? []), item];
    return groups;
  }, {});
}

function trendFromRows(rows: MetaInsightRow[]): TrendPoint[] {
  return Object.entries(groupBy(rows, (row) => row.dateStart))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, dateRows]) => ({
      date,
      impressions: dateRows.reduce((total, row) => total + (row.impressions ?? 0), 0),
      clicks: dateRows.reduce((total, row) => total + (row.clicks ?? 0), 0),
      conversions: Number(dateRows.reduce((total, row) => total + (row.conversions ?? 0), 0).toFixed(2))
    }));
}

export async function getDashboardData(filters: DashboardFilters): Promise<DashboardData> {
  const provider = createMockMetaAdsProvider();
  const accounts = await fetchAllPages<MetaAdAccount>((after) => provider.listAdAccounts({ limit: 100, after }));
  const filteredByClient = filters.clientId
    ? accounts.filter((account) => clientForAccount(account.id).id === filters.clientId)
    : accounts;
  const selectedAccounts = filters.accountId ? filteredByClient.filter((account) => account.id === filters.accountId) : filteredByClient;
  const effectiveAccounts = selectedAccounts.length > 0 ? selectedAccounts : filteredByClient;
  const range = resolveDatePreset(filters.preset, getPrimaryTimezone(effectiveAccounts), new Date("2026-09-10T12:00:00.000Z"));
  const previousRange = previousEquivalentPeriod(range);

  const rowsByAccount = await Promise.all(
    effectiveAccounts.map(async (account) => ({
      account,
      rows: await getRowsForRange(account.id, range, "account"),
      previousRows: await getRowsForRange(account.id, previousRange, "account"),
      campaignRows: await getRowsForRange(account.id, range, "campaign")
    }))
  );

  const accountSummaries = rowsByAccount.map(({ account, rows, previousRows }) => ({
    account,
    client: clientForAccount(account.id),
    metrics: aggregateRows(rows),
    previousMetrics: aggregateRows(previousRows),
    lastSyncAt: "2026-09-10T11:45:00.000Z",
    freshnessState: "fresh" as const
  }));

  const deliveryMetrics = aggregateRows(rowsByAccount.flatMap((item) => item.rows));

  const currencySummaries = Object.entries(groupBy(accountSummaries, (summary) => summary.account.currency)).map(([currency, summaries]) => {
    const metrics = aggregateSourceMetrics(summaries.map((summary) => metricSetToInput(summary.metrics)));
    const previousMetrics = aggregateSourceMetrics(summaries.map((summary) => metricSetToInput(summary.previousMetrics)));
    return { currency, metrics, previousMetrics, anomalies: detectAnomalies(metrics, previousMetrics) };
  });

  const campaignSummaries = rowsByAccount.flatMap(({ account, campaignRows }) =>
    Object.entries(groupBy(campaignRows, (row) => row.entityId)).map(([campaignId, rows]) => ({
      id: campaignId,
      name: rows[0]?.entityName ?? campaignId,
      accountId: account.id,
      accountName: account.name,
      clientName: clientForAccount(account.id).name,
      currency: account.currency,
      metrics: aggregateRows(rows)
    }))
  );

  const allRows = rowsByAccount.flatMap((item) => item.rows);
  const currencies = new Set(effectiveAccounts.map((account) => account.currency));
  const caveats = [
    "Milestone 6 dashboard uses deterministic mock Meta data only; no live Meta account facts are displayed yet.",
    "Financial KPIs are grouped by currency and are never silently mixed.",
    "Unavailable metrics are shown as unavailable/null and are not converted to zero."
  ];

  if (currencies.size > 1) {
    caveats.push("Multiple currencies are selected, so ROAS and spend/value summaries are shown per currency.");
  }

  return {
    generatedAt: new Date("2026-09-10T12:00:00.000Z").toISOString(),
    range,
    previousRange,
    clients: dashboardClients,
    accounts,
    selectedAccounts: effectiveAccounts,
    accountSummaries,
    deliveryMetrics,
    currencySummaries,
    campaignSummaries,
    trend: trendFromRows(allRows),
    totals: {
      clients: dashboardClients.length,
      connectedAccounts: accounts.filter((account) => account.accessStatus === "connected").length,
      selectedAccounts: effectiveAccounts.length
    },
    caveats
  };
}

function metricSetToInput(metrics: AnalyticsMetricSet) {
  return {
    spend: metrics.spend.value,
    impressions: metrics.impressions.value,
    reach: metrics.reach.value,
    clicks: metrics.clicks.value,
    linkClicks: metrics.linkClicks.value,
    outboundClicks: metrics.outboundClicks.value,
    conversions: metrics.conversions.value,
    conversionValue: metrics.conversionValue.value,
    availability: {
      spend: metrics.spend.state,
      impressions: metrics.impressions.state,
      reach: metrics.reach.state,
      clicks: metrics.clicks.state,
      linkClicks: metrics.linkClicks.state,
      outboundClicks: metrics.outboundClicks.state,
      conversions: metrics.conversions.state,
      conversionValue: metrics.conversionValue.state
    }
  };
}

export function clientSummariesFromDashboard(data: DashboardData) {
  return data.clients.map((client) => {
    const accounts = data.accountSummaries.filter((summary) => summary.client.id === client.id);
    const metrics = accounts.length
      ? aggregateSourceMetrics(accounts.map((account) => metricSetToInput(account.metrics)))
      : toAnalyticsMetricSet({});
    return { client, accounts, metrics };
  });
}
