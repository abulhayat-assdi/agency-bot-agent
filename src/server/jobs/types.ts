import type { DateRangePreset } from "@/lib/dates/reporting";

export const SYNC_QUEUE_NAME = "meta-sync";
export const SYNC_AD_ACCOUNT_JOB = "sync-ad-account";
export const SYNC_ALL_ACCOUNTS_JOB = "sync-all-ad-accounts";
export const SYNC_ACCOUNT_CHUNK_JOB = "sync-account-chunk";
export const SYNC_BACKFILL_PLANNER_JOB = "sync-backfill-planner";

export type SyncJobType = "scheduled" | "manual" | "backfill" | "incremental";
export type SyncKind = "initial" | "incremental" | "backfill" | "manual";
export type SyncJobStatus = "queued" | "running" | "success" | "partial" | "failed" | "cancelled";

export type SyncDateRange = {
  since: string;
  until: string;
};

export type RollingSyncWindow = {
  rollingDatePreset?: DateRangePreset;
  timezone?: string;
};

export type SyncAdAccountJobData = {
  agencyId: string;
  accountId: string;
  requestedByUserId?: string;
  type: SyncJobType;
  dateRange: SyncDateRange;
  includeBreakdowns?: boolean;
  traceId: string;
} & RollingSyncWindow;

export type SyncAllAccountsJobData = {
  agencyId: string;
  requestedByUserId?: string;
  type: SyncJobType;
  dateRange: SyncDateRange;
  includeBreakdowns?: boolean;
  traceId: string;
} & RollingSyncWindow;

export type SyncQueueJobData = SyncAdAccountJobData | SyncAllAccountsJobData | SyncAccountChunkJobData | SyncBackfillPlannerJobData;

/** One date chunk of an account sync. Payload carries identifiers only — never tokens. */
export type SyncAccountChunkJobData = {
  agencyId: string;
  accountId: string;
  parentRunId: string;
  chunkIndex: number;
  totalChunks: number;
  dateRange: SyncDateRange;
  syncKind: SyncKind;
  syncType: SyncJobType;
  includeBreakdowns?: boolean;
  requestedByUserId?: string;
  traceId: string;
};

/** Planner job: creates chunk jobs for a parent run (and resumes by skipping completed chunks). */
export type SyncBackfillPlannerJobData = {
  agencyId: string;
  accountId: string;
  parentRunId: string;
  dateStart: string;
  dateEnd: string;
  timezone?: string;
  syncKind: SyncKind;
  syncType: SyncJobType;
  chunkDays: number;
  includeBreakdowns?: boolean;
  requestedByUserId?: string;
  traceId: string;
};

export type SyncJobResult = {
  status: Exclude<SyncJobStatus, "queued" | "running" | "cancelled">;
  traceId: string;
  accountId?: string;
  stats: {
    accountsScanned: number;
    campaignsScanned: number;
    adSetsScanned: number;
    adsScanned: number;
    creativesScanned: number;
    insightsScanned: number;
    breakdownRowsScanned: number;
    unavailableMetricStates: number;
  };
  warnings: string[];
};

export type QueueReadiness = {
  configured: boolean;
  queueName: string;
  redisUrlPresent: boolean;
  workerConcurrency: number;
  defaultAttempts: number;
  repeatableSyncIntervalMinutes: number;
};
