import { and, asc, desc, eq, gte, inArray, isNull, lte } from "drizzle-orm";

import type { Database } from "@/server/db/client";
import { adAccounts, adSets, ads, breakdownMetricDaily, campaigns, metricDaily, syncErrors, syncRuns } from "@/server/db/schema";
import { addDays, previousEquivalentPeriod, resolveDatePreset, type DateRangePreset } from "@/lib/dates/reporting";

/**
 * Read-only queries over persisted Meta data for the chat analyst. Every
 * function reads PostgreSQL only (never the Meta API, never mock data) and is
 * scoped to one agency.
 */

export const MAX_RANGE_DAYS = 400;

export type ChatAccount = {
  id: string;
  metaAccountId: string;
  name: string;
  currency: string;
  timezone: string;
  lastSyncAt: string | null;
  lastSyncState: string | null;
};

export type DateRange = { since: string; until: string };

export type MetricTotals = {
  spend: number;
  impressions: number;
  reach: number | null;
  clicks: number;
  linkClicks: number;
  conversions: number;
  conversionValue: number;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  cpa: number | null;
  roas: number | null;
  actions: Record<string, number>;
};

type MetricRow = {
  spend: string | null;
  impressions: number | null;
  reach: number | null;
  clicks: number | null;
  linkClicks: number | null;
  conversions: string | null;
  conversionValue: string | null;
  actionMetrics: Record<string, unknown>;
};

const num = (value: string | number | null | undefined) => {
  if (value === null || value === undefined) return 0;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const ratio = (numerator: number, denominator: number, scale = 1) => (denominator > 0 ? round((numerator / denominator) * scale) : null);

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function sumRows(rows: MetricRow[], includeReach = false): MetricTotals {
  const totals = { spend: 0, impressions: 0, reach: 0, clicks: 0, linkClicks: 0, conversions: 0, conversionValue: 0 };
  const actions: Record<string, number> = {};
  for (const row of rows) {
    totals.spend += num(row.spend);
    totals.impressions += num(row.impressions);
    totals.reach += num(row.reach);
    totals.clicks += num(row.clicks);
    totals.linkClicks += num(row.linkClicks);
    totals.conversions += num(row.conversions);
    totals.conversionValue += num(row.conversionValue);
    for (const [key, value] of Object.entries(row.actionMetrics ?? {})) {
      if (typeof value === "number" && Number.isFinite(value)) actions[key] = (actions[key] ?? 0) + value;
    }
  }
  return {
    spend: round(totals.spend),
    impressions: totals.impressions,
    // Reach is not additive across days; only report it for a single row.
    reach: includeReach && rows.length === 1 ? totals.reach : null,
    clicks: totals.clicks,
    linkClicks: totals.linkClicks,
    conversions: round(totals.conversions),
    conversionValue: round(totals.conversionValue),
    ctr: ratio(totals.clicks, totals.impressions, 100),
    cpc: ratio(totals.spend, totals.clicks),
    cpm: ratio(totals.spend, totals.impressions, 1000),
    cpa: ratio(totals.spend, totals.conversions),
    roas: ratio(totals.conversionValue, totals.spend),
    actions: Object.fromEntries(
      Object.entries(actions)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 12)
        .map(([key, value]) => [key, round(value)])
    )
  };
}

const metricSelection = {
  spend: metricDaily.spend,
  impressions: metricDaily.impressions,
  reach: metricDaily.reach,
  clicks: metricDaily.clicks,
  linkClicks: metricDaily.linkClicks,
  conversions: metricDaily.conversions,
  conversionValue: metricDaily.conversionValue,
  actionMetrics: metricDaily.actionMetrics
};

export async function listChatAccounts(db: Database, agencyId: string): Promise<ChatAccount[]> {
  const rows = await db
    .select()
    .from(adAccounts)
    .where(and(eq(adAccounts.agencyId, agencyId), isNull(adAccounts.archivedAt)))
    .orderBy(asc(adAccounts.name));
  return rows.map((row) => ({
    id: row.id,
    metaAccountId: row.metaAccountId.startsWith("act_") ? row.metaAccountId : `act_${row.metaAccountId}`,
    name: row.name,
    currency: row.currency,
    timezone: row.timezone,
    lastSyncAt: row.lastSuccessfulSyncAt?.toISOString() ?? null,
    lastSyncState: row.lastSyncState ?? null
  }));
}

/** Resolves an account by Meta id, DB id or (partial) name; defaults to the first account. */
export function pickAccount(accounts: ChatAccount[], reference?: string | null): ChatAccount | null {
  if (!reference) return accounts[0] ?? null;
  const needle = reference.trim().toLowerCase();
  const bare = needle.replace(/^act_/, "");
  return (
    accounts.find((account) => account.id === reference || account.metaAccountId.toLowerCase() === needle || account.metaAccountId.replace(/^act_/, "") === bare) ??
    accounts.find((account) => account.name.toLowerCase().includes(needle)) ??
    null
  );
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function daysBetween(since: string, until: string) {
  return Math.round((Date.parse(`${until}T00:00:00Z`) - Date.parse(`${since}T00:00:00Z`)) / 86_400_000) + 1;
}

/** Normalizes a requested range: explicit dates win, then a preset, then the last 7 days. */
export function resolveRange(account: ChatAccount, input: { since?: string | null; until?: string | null; preset?: string | null }): DateRange {
  if (input.since && input.until && DATE_RE.test(input.since) && DATE_RE.test(input.until)) {
    let { since, until } = input;
    if (since > until) [since, until] = [until, since];
    if (daysBetween(since, until) > MAX_RANGE_DAYS) since = addDays(until, -(MAX_RANGE_DAYS - 1));
    return { since, until };
  }
  const preset = (input.preset ?? "last_7_days") as DateRangePreset;
  try {
    const range = resolveDatePreset(preset, account.timezone);
    return { since: range.since, until: range.until };
  } catch {
    const range = resolveDatePreset("last_7_days", account.timezone);
    return { since: range.since, until: range.until };
  }
}

async function dataCoverage(db: Database, account: ChatAccount) {
  const rows = await db
    .select({ date: metricDaily.date })
    .from(metricDaily)
    .where(and(eq(metricDaily.adAccountId, account.id), eq(metricDaily.entityLevel, "account")))
    .orderBy(asc(metricDaily.date));
  return { firstDate: rows[0]?.date ?? null, lastDate: rows.at(-1)?.date ?? null, daysWithData: rows.length };
}

export async function getAccountOverview(db: Database, account: ChatAccount, range: DateRange) {
  const previous = previousEquivalentPeriod({ ...range, timezone: account.timezone });
  const load = (r: DateRange) =>
    db
      .select({ date: metricDaily.date, ...metricSelection })
      .from(metricDaily)
      .where(and(eq(metricDaily.adAccountId, account.id), eq(metricDaily.entityLevel, "account"), gte(metricDaily.date, r.since), lte(metricDaily.date, r.until)))
      .orderBy(asc(metricDaily.date));
  const [current, prior, coverage] = await Promise.all([load(range), load(previous), dataCoverage(db, account)]);
  return {
    account: { name: account.name, id: account.metaAccountId, currency: account.currency, timezone: account.timezone, lastSyncAt: account.lastSyncAt },
    range,
    previousRange: { since: previous.since, until: previous.until },
    totals: sumRows(current),
    previousTotals: sumRows(prior),
    daily: current.map((row) => ({
      date: row.date,
      spend: round(num(row.spend)),
      impressions: num(row.impressions),
      clicks: num(row.clicks),
      conversions: round(num(row.conversions))
    })),
    dataCoverage: coverage,
    note: current.length === 0 ? "No persisted data for this range. The account may not be synced for these dates yet." : undefined
  };
}

export type EntityLevel = "campaign" | "adset" | "ad";
export type SortKey = "spend" | "impressions" | "clicks" | "ctr" | "cpc" | "cpm" | "conversions" | "cpa" | "roas";

export async function getEntityPerformance(
  db: Database,
  account: ChatAccount,
  range: DateRange,
  options: { level: EntityLevel; sortBy?: SortKey; order?: "desc" | "asc"; limit?: number; nameContains?: string | null }
) {
  const rows = await db
    .select({ entityId: metricDaily.entityId, entityKey: metricDaily.entityKey, ...metricSelection })
    .from(metricDaily)
    .where(
      and(eq(metricDaily.adAccountId, account.id), eq(metricDaily.entityLevel, options.level), gte(metricDaily.date, range.since), lte(metricDaily.date, range.until))
    );

  const grouped = new Map<string, { entityId: string | null; rows: MetricRow[] }>();
  for (const row of rows) {
    const group = grouped.get(row.entityKey) ?? { entityId: row.entityId, rows: [] };
    group.rows.push(row);
    grouped.set(row.entityKey, group);
  }

  const ids = [...grouped.values()].map((group) => group.entityId).filter((id): id is string => Boolean(id));
  const names = await entityNames(db, options.level, ids);

  let entities = [...grouped.entries()].map(([key, group]) => {
    const meta = group.entityId ? names.get(group.entityId) : undefined;
    return { id: key, name: meta?.name ?? key, status: meta?.status ?? null, parent: meta?.parent ?? null, ...sumRows(group.rows) };
  });

  if (options.nameContains) {
    const needle = options.nameContains.toLowerCase();
    entities = entities.filter((entity) => entity.name.toLowerCase().includes(needle) || (entity.parent ?? "").toLowerCase().includes(needle));
  }

  const sortBy = options.sortBy ?? "spend";
  const direction = options.order === "asc" ? 1 : -1;
  entities.sort((a, b) => {
    const left = a[sortBy];
    const right = b[sortBy];
    if (left === null && right === null) return 0;
    if (left === null) return 1;
    if (right === null) return -1;
    return (left - right) * direction;
  });

  const limit = Math.min(Math.max(options.limit ?? 15, 1), 50);
  return {
    account: account.name,
    currency: account.currency,
    level: options.level,
    range,
    totalEntitiesWithData: entities.length,
    sortedBy: `${sortBy} ${options.order ?? "desc"}`,
    entities: entities.slice(0, limit),
    note: entities.length === 0 ? `No ${options.level}-level data stored for this range.` : undefined
  };
}

async function entityNames(db: Database, level: EntityLevel, ids: string[]) {
  const names = new Map<string, { name: string; status: string | null; parent: string | null }>();
  if (ids.length === 0) return names;
  if (level === "campaign") {
    const rows = await db
      .select({ id: campaigns.id, name: campaigns.name, status: campaigns.effectiveStatus, objective: campaigns.objective })
      .from(campaigns)
      .where(inArray(campaigns.id, ids));
    for (const row of rows) names.set(row.id, { name: row.name, status: row.status, parent: row.objective });
  } else if (level === "adset") {
    const rows = await db
      .select({ id: adSets.id, name: adSets.name, status: adSets.effectiveStatus, campaign: campaigns.name })
      .from(adSets)
      .leftJoin(campaigns, eq(adSets.campaignId, campaigns.id))
      .where(inArray(adSets.id, ids));
    for (const row of rows) names.set(row.id, { name: row.name, status: row.status, parent: row.campaign });
  } else {
    const rows = await db
      .select({ id: ads.id, name: ads.name, status: ads.effectiveStatus, adSet: adSets.name })
      .from(ads)
      .leftJoin(adSets, eq(ads.adSetId, adSets.id))
      .where(inArray(ads.id, ids));
    for (const row of rows) names.set(row.id, { name: row.name, status: row.status, parent: row.adSet });
  }
  return names;
}

export const SYNCED_BREAKDOWNS = ["age", "gender", "country", "publisher_platform"] as const;

export async function getBreakdown(db: Database, account: ChatAccount, range: DateRange, breakdown: string) {
  const rows = await db
    .select({ values: breakdownMetricDaily.breakdownValues, ...metricSelectionFor(breakdownMetricDaily) })
    .from(breakdownMetricDaily)
    .where(
      and(
        eq(breakdownMetricDaily.adAccountId, account.id),
        eq(breakdownMetricDaily.breakdownKey, breakdown),
        gte(breakdownMetricDaily.date, range.since),
        lte(breakdownMetricDaily.date, range.until)
      )
    );
  const grouped = new Map<string, MetricRow[]>();
  for (const row of rows) {
    const label = Object.values(row.values ?? {}).join(" / ") || "unknown";
    grouped.set(label, [...(grouped.get(label) ?? []), row]);
  }
  const segments = [...grouped.entries()]
    .map(([segment, segmentRows]) => ({ segment, ...sumRows(segmentRows) }))
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 30);
  return {
    account: account.name,
    currency: account.currency,
    breakdown,
    range,
    segments,
    note:
      segments.length === 0
        ? `No ${breakdown} breakdown data stored for this range. Synced breakdowns: ${SYNCED_BREAKDOWNS.join(", ")}.`
        : "Breakdown rows are summed across campaigns."
  };
}

function metricSelectionFor(table: typeof breakdownMetricDaily) {
  return {
    spend: table.spend,
    impressions: table.impressions,
    reach: table.reach,
    clicks: table.clicks,
    linkClicks: table.linkClicks,
    conversions: table.conversions,
    conversionValue: table.conversionValue,
    actionMetrics: table.actionMetrics
  };
}

export async function getSyncStatus(db: Database, agencyId: string, account: ChatAccount) {
  const [runs, errors, coverage, counts] = await Promise.all([
    db
      .select({ status: syncRuns.status, type: syncRuns.type, createdAt: syncRuns.createdAt, finishedAt: syncRuns.finishedAt, errorSummary: syncRuns.errorSummary })
      .from(syncRuns)
      .where(and(eq(syncRuns.agencyId, agencyId), eq(syncRuns.adAccountId, account.id)))
      .orderBy(desc(syncRuns.createdAt))
      .limit(5),
    db
      .select({ message: syncErrors.safeMessage, occurredAt: syncErrors.occurredAt })
      .from(syncErrors)
      .where(eq(syncErrors.adAccountId, account.id))
      .orderBy(desc(syncErrors.occurredAt))
      .limit(5),
    dataCoverage(db, account),
    Promise.all([
      db.$count(campaigns, eq(campaigns.adAccountId, account.id)),
      db.$count(adSets, eq(adSets.adAccountId, account.id)),
      db.$count(ads, eq(ads.adAccountId, account.id))
    ])
  ]);
  return {
    account: account.name,
    lastSuccessfulSyncAt: account.lastSyncAt,
    lastSyncState: account.lastSyncState,
    dataCoverage: coverage,
    storedEntities: { campaigns: counts[0], adSets: counts[1], ads: counts[2] },
    recentRuns: runs.map((run) => ({ ...run, createdAt: run.createdAt.toISOString(), finishedAt: run.finishedAt?.toISOString() ?? null })),
    recentErrors: errors.map((error) => ({ message: error.message.slice(0, 240), occurredAt: error.occurredAt.toISOString() })),
    syncedBreakdowns: SYNCED_BREAKDOWNS
  };
}
