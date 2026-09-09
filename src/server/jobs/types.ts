import type { DateRangePreset } from "@/lib/dates/reporting";

export const SYNC_QUEUE_NAME = "meta-sync";
export const SYNC_AD_ACCOUNT_JOB = "sync-ad-account";
export const SYNC_ALL_ACCOUNTS_JOB = "sync-all-ad-accounts";

export type SyncJobType = "scheduled" | "manual" | "backfill" | "incremental";
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

export type SyncQueueJobData = SyncAdAccountJobData | SyncAllAccountsJobData;

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
