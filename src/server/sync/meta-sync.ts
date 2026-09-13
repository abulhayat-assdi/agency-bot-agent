import { createHash } from "node:crypto";

import { resolveDatePreset, type DateRangePreset } from "@/lib/dates/reporting";
import { MetaApiError } from "@/server/meta/errors";
import { fetchAllPagesBounded } from "@/server/meta/pagination";
import type {
  MetaAd,
  MetaAdAccount,
  MetaAdSet,
  MetaAvailabilityState,
  MetaBreakdownRow,
  MetaCampaign,
  MetaDateRange,
  MetaEntityLevel,
  MetaInsightRow
} from "@/server/meta/types";
import type { MetaAdsProvider } from "@/server/meta/types";
import { logger } from "@/server/observability/logger";

export type SyncDateRangeInput =
  | { preset: "today" | "yesterday" | "last_7_days" | "last_30_days"; timezone?: string }
  | { preset?: undefined; dateRange: MetaDateRange };

export function resolveSyncDateRange(input: SyncDateRangeInput, referenceInstant = new Date()): MetaDateRange {
  if ("dateRange" in input && input.dateRange) return input.dateRange;
  const preset = (input as { preset?: string }).preset ?? "last_7_days";
  const timezone = (input as { timezone?: string }).timezone ?? "UTC";
  const mapped: Record<string, DateRangePreset> = {
    today: "today",
    yesterday: "yesterday",
    last_7_days: "last_7_days",
    last_30_days: "last_30_days"
  };
  return resolveDatePreset(mapped[preset] ?? "last_7_days", timezone, referenceInstant);
}

export type RawIngestionInput = {
  provider: "mock" | "graph-api";
  endpoint: string;
  accountId: string;
  requestParams: Record<string, unknown>;
  apiVersion: string;
  responseCursor?: string;
  payload: unknown;
};

export type RawIngestionRecord = {
  source: string;
  sourceObjectId?: string;
  endpoint: string;
  requestHash: string;
  responsePageCursor?: string;
  payload: Record<string, unknown>;
  payloadHash: string;
  receivedAt: string;
};

const SAFE_PARAM_KEYS = new Set([
  "fields",
  "level",
  "breakdowns",
  "time_range",
  "time_increment",
  "date_preset",
  "filtering",
  "limit",
  "after",
  "level_filter"
]);

export function buildRawIngestionRecord(input: RawIngestionInput): RawIngestionRecord {
  const safeParams: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input.requestParams)) {
    if (SAFE_PARAM_KEYS.has(key)) safeParams[key] = value;
  }
  const requestHash = createHash("sha256").update(JSON.stringify({ endpoint: input.endpoint, params: safeParams })).digest("hex");
  const payloadJson = JSON.stringify(input.payload ?? {});
  return {
    source: input.provider,
    sourceObjectId: input.accountId,
    endpoint: input.endpoint,
    requestHash,
    responsePageCursor: input.responseCursor,
    payload: {
      provider: input.provider,
      endpoint: input.endpoint,
      accountId: input.accountId,
      requestParams: safeParams,
      retrievedAt: new Date().toISOString(),
      apiVersion: input.apiVersion,
      response: input.payload
    },
    payloadHash: createHash("sha256").update(payloadJson).digest("hex"),
    receivedAt: new Date().toISOString()
  };
}

export type SyncStageResult = {
  stage: string;
  scanned: number;
  rawRecords: number;
  errors: Array<{ stage: string; safeMessage: string; retryable: boolean; code?: string }>;
};

export type SyncAccountResult = {
  account: MetaAdAccount | null;
  stages: SyncStageResult[];
  availability: Array<{ entityLevel: MetaEntityLevel; entityKey: string; metricKey: string; state: MetaAvailabilityState }>;
  rawRecords: RawIngestionRecord[];
  status: "success" | "partial" | "failed";
};

export type SyncPersistHooks = {
  upsertAccount?: (account: MetaAdAccount) => Promise<unknown>;
  upsertCampaigns?: (campaigns: MetaCampaign[]) => Promise<unknown>;
  upsertAdSets?: (adSets: MetaAdSet[]) => Promise<unknown>;
  upsertAds?: (ads: MetaAd[]) => Promise<unknown>;
  upsertInsights?: (rows: MetaInsightRow[]) => Promise<unknown>;
  upsertBreakdowns?: (rows: MetaBreakdownRow[]) => Promise<unknown>;
  recordRaw?: (record: RawIngestionRecord) => Promise<unknown>;
};

export function insightIdempotencyKey(row: MetaInsightRow) {
  return [row.accountId, row.level, row.entityId, row.dateStart, row.dateStop].join("|");
}

export function breakdownIdempotencyKey(row: MetaBreakdownRow) {
  return [row.accountId, row.level, row.entityId, row.breakdownKey, JSON.stringify(row.breakdownValues), row.dateStart, row.dateStop].join("|");
}

export function dedupeByKey<T>(rows: T[], keyFn: (row: T) => string): T[] {
  const seen = new Map<string, T>();
  for (const row of rows) seen.set(keyFn(row), row);
  return [...seen.values()];
}

function stageResult(stage: string): SyncStageResult {
  return { stage, scanned: 0, rawRecords: 0, errors: [] };
}

async function runStage<T>(
  result: SyncStageResult,
  fetchPage: (paging?: { limit?: number; after?: string }) => Promise<{ data: T[]; paging: { cursors: { after?: string } } }>,
  sink: (rows: T[]) => Promise<unknown> | unknown,
  raw: (page: { data: T[] }, cursor?: string) => RawIngestionRecord | null,
  hooks: SyncPersistHooks
) {
  const { rows } = await fetchAllPagesBounded(fetchPage, { maxPages: 50, pageSize: 100 });
  result.scanned += rows.length;
  await sink(rows);
  // Record one raw envelope per stage (paginated detail omitted for brevity; cursor preserved).
  const record = raw({ data: rows.slice(0, 25) }, undefined);
  if (record) {
    result.rawRecords += 1;
    await hooks.recordRaw?.(record);
  }
  return rows;
}

export async function syncAccount(
  provider: MetaAdsProvider,
  accountId: string,
  dateRange: MetaDateRange,
  hooks: SyncPersistHooks = {},
  options: { providerName?: "mock" | "graph-api"; apiVersion?: string; includeBreakdowns?: boolean } = {}
): Promise<SyncAccountResult> {
  const providerName = options.providerName ?? "mock";
  const apiVersion = options.apiVersion ?? "v26.0";
  const stages: SyncStageResult[] = [];
  const rawRecords: RawIngestionRecord[] = [];
  const availability: SyncAccountResult["availability"] = [];
  const recordHooks: SyncPersistHooks = {
    ...hooks,
    recordRaw: async (record) => {
      rawRecords.push(record);
      await hooks.recordRaw?.(record);
    }
  };
  let status: SyncAccountResult["status"] = "success";
  const fail = (stage: SyncStageResult, error: unknown) => {
    status = "failed";
    stage.errors.push({
      stage: stage.stage,
      safeMessage: error instanceof MetaApiError ? error.message : "Meta sync stage failed.",
      retryable: error instanceof MetaApiError ? error.retryable : false,
      code: error instanceof MetaApiError ? error.code : undefined
    });
  };

  // 1. validate connection
  const healthStage = stageResult("validate_connection");
  stages.push(healthStage);
  try {
    const health = await provider.healthCheck();
    if (health.status !== "connected") {
      status = "failed";
      healthStage.errors.push({ stage: healthStage.stage, safeMessage: `Meta connection is ${health.status}.`, retryable: false });
      return { account: null, stages, availability, rawRecords, status };
    }
  } catch (error) {
    fail(healthStage, error);
    return { account: null, stages, availability, rawRecords, status };
  }

  // 2. fetch account metadata
  const accountStage = stageResult("fetch_account");
  stages.push(accountStage);
  let account: MetaAdAccount | null = null;
  try {
    account = await provider.getAdAccount(accountId);
    if (!account) {
      status = "partial";
      accountStage.errors.push({ stage: accountStage.stage, safeMessage: "Account was not returned by the provider.", retryable: false });
      return { account: null, stages, availability, rawRecords, status };
    }
    accountStage.scanned = 1;
    await recordHooks.upsertAccount?.(account);
    const record = buildRawIngestionRecord({
      provider: providerName,
      endpoint: "account_metadata",
      accountId: account.id,
      requestParams: { fields: "id,name,currency,timezone_name,account_status" },
      apiVersion,
      payload: account
    });
    rawRecords.push(record);
    await hooks.recordRaw?.(record);
    accountStage.rawRecords += 1;
  } catch (error) {
    fail(accountStage, error);
    return { account: null, stages, availability, rawRecords, status };
  }

  const resolvedAccount = account as MetaAdAccount;

  // 3-5. hierarchy
  const hierarchy: Array<{ stage: string; run: () => Promise<unknown> }> = [
    {
      stage: "fetch_campaigns",
      run: async () => {
        const stage = stageResult("fetch_campaigns");
        stages.push(stage);
        try {
          await runStage<MetaCampaign>(
            stage,
            (paging) => provider.listCampaigns(resolvedAccount.id, paging),
            (rows) => recordHooks.upsertCampaigns?.(rows),
            (page) =>
              buildRawIngestionRecord({
                provider: providerName,
                endpoint: "campaigns",
                accountId: resolvedAccount.id,
                requestParams: { fields: "campaigns" },
                apiVersion,
                payload: page
              }),
            recordHooks
          );
        } catch (error) {
          fail(stage, error);
        }
      }
    },
    {
      stage: "fetch_adsets",
      run: async () => {
        const stage = stageResult("fetch_adsets");
        stages.push(stage);
        try {
          await runStage<MetaAdSet>(
            stage,
            (paging) => provider.listAdSets(resolvedAccount.id, undefined, paging),
            (rows) => recordHooks.upsertAdSets?.(rows),
            (page) =>
              buildRawIngestionRecord({
                provider: providerName,
                endpoint: "adsets",
                accountId: resolvedAccount.id,
                requestParams: { fields: "adsets" },
                apiVersion,
                payload: page
              }),
            recordHooks
          );
        } catch (error) {
          fail(stage, error);
        }
      }
    },
    {
      stage: "fetch_ads",
      run: async () => {
        const stage = stageResult("fetch_ads");
        stages.push(stage);
        try {
          await runStage<MetaAd>(
            stage,
            (paging) => provider.listAds(resolvedAccount.id, undefined, paging),
            (rows) => recordHooks.upsertAds?.(rows),
            (page) =>
              buildRawIngestionRecord({
                provider: providerName,
                endpoint: "ads",
                accountId: resolvedAccount.id,
                requestParams: { fields: "ads" },
                apiVersion,
                payload: page
              }),
            recordHooks
          );
        } catch (error) {
          fail(stage, error);
        }
      }
    }
  ];

  for (const item of hierarchy) {
    await item.run();
    if ((status as string) === "failed") return { account: resolvedAccount, stages, availability, rawRecords, status };
  }

  // 6. insights per level
  const levels: MetaEntityLevel[] = ["account", "campaign", "adset", "ad"];
  for (const level of levels) {
    const stage = stageResult(`fetch_insights_${level}`);
    stages.push(stage);
    try {
      const { rows } = await fetchAllPagesBounded((paging) => provider.getInsights({ accountId: resolvedAccount.id, level, dateRange, timeIncrement: 1, ...paging }), {
        maxPages: 50,
        pageSize: 100
      });
      const deduped = dedupeByKey(rows, insightIdempotencyKey);
      stage.scanned = deduped.length;
      await recordHooks.upsertInsights?.(deduped);
      for (const row of deduped) {
        for (const [metricKey, state] of Object.entries(row.availability)) {
          if (!state || state === "available" || state === "actual_zero") continue;
          availability.push({ entityLevel: level, entityKey: row.entityId, metricKey, state: state as MetaAvailabilityState });
        }
      }
      const record = buildRawIngestionRecord({
        provider: providerName,
        endpoint: `insights_${level}`,
        accountId: resolvedAccount.id,
        requestParams: { level, time_range: dateRange, time_increment: 1 },
        apiVersion,
        payload: { count: deduped.length }
      });
      rawRecords.push(record);
      await hooks.recordRaw?.(record);
      stage.rawRecords += 1;
    } catch (error) {
      if (error instanceof MetaApiError && error.kind === "unsupported_breakdown") {
        status = "partial";
        stage.errors.push({ stage: stage.stage, safeMessage: "Requested breakdown combination is unsupported.", retryable: false });
        continue;
      }
      fail(stage, error);
      return { account: resolvedAccount, stages, availability, rawRecords, status };
    }
  }

  // 7. breakdowns (default safe combos)
  if (options.includeBreakdowns !== false) {
    const combos: string[][] = [["age"], ["gender"], ["country"], ["publisher_platform"]];
    for (const breakdowns of combos) {
      const stage = stageResult(`fetch_breakdown_${breakdowns.join(",")}`);
      stages.push(stage);
      try {
        const { rows } = await fetchAllPagesBounded(
          (paging) => provider.getBreakdowns({ accountId: resolvedAccount.id, level: "campaign", dateRange, breakdowns, ...paging }),
          { maxPages: 20, pageSize: 100 }
        );
        const deduped = dedupeByKey(rows, breakdownIdempotencyKey);
        stage.scanned = deduped.length;
        await recordHooks.upsertBreakdowns?.(deduped);
        const record = buildRawIngestionRecord({
          provider: providerName,
          endpoint: `breakdowns_${breakdowns.join(",")}`,
          accountId: resolvedAccount.id,
          requestParams: { level: "campaign", breakdowns: breakdowns.join(",") },
          apiVersion,
          payload: { count: deduped.length }
        });
        rawRecords.push(record);
        await hooks.recordRaw?.(record);
        stage.rawRecords += 1;
      } catch (error) {
        if (error instanceof MetaApiError && (error.kind === "unsupported_breakdown" || error.kind === "invalid_request")) {
          if (status === "success") status = "partial";
          stage.errors.push({ stage: stage.stage, safeMessage: "Requested breakdown combination is unsupported.", retryable: false });
          availability.push({ entityLevel: "campaign", entityKey: resolvedAccount.id, metricKey: breakdowns.join(","), state: "unsupported" });
          continue;
        }
        fail(stage, error);
        return { account: resolvedAccount, stages, availability, rawRecords, status };
      }
    }
  }

  if (stages.some((stage) => stage.errors.length > 0) && status === "success") status = "partial";
  if (availability.length > 0 && status === "success") status = "partial";

  logger.info("Meta account sync finished", { accountId: resolvedAccount.id, status, stages: stages.length, rawRecords: rawRecords.length });
  return { account: resolvedAccount, stages, availability, rawRecords, status };
}
