import { incrementalSyncRange } from "@/server/sync/chunks";

export type SchedulerAccountSpec = {
  agencyId: string;
  metaAccountId: string;
  accountDbId: string | null;
  timezone: string;
};

export type ScheduledSyncSpec = {
  agencyId: string;
  accountId: string;
  accountDbId: string | null;
  syncKind: "incremental";
  syncType: "scheduled";
  dateStart: string;
  dateEnd: string;
  timezone: string;
  chunkDays: number;
  /** Deterministic dedup key: scheduler restarts must not duplicate this scope. */
  dedupKey: string;
  traceId: string;
};

export function incrementalDedupKey(metaAccountId: string, since: string, until: string) {
  return `scheduled:incremental:${metaAccountId}:${since}:${until}`;
}

export function planIncrementalSyncs(
  accounts: SchedulerAccountSpec[],
  options: { lookbackDays: number; chunkDays: number; traceId: string; referenceInstant?: Date }
): ScheduledSyncSpec[] {
  return accounts.map((account) => {
    const range = incrementalSyncRange(account.timezone, options.lookbackDays, options.referenceInstant);
    return {
      agencyId: account.agencyId,
      accountId: account.metaAccountId,
      accountDbId: account.accountDbId,
      syncKind: "incremental",
      syncType: "scheduled",
      dateStart: range.since,
      dateEnd: range.until,
      timezone: account.timezone,
      chunkDays: options.chunkDays,
      dedupKey: incrementalDedupKey(account.metaAccountId, range.since, range.until),
      traceId: options.traceId
    };
  });
}

export type ActiveRunScope = {
  metaAccountId: string | null;
  syncKind: string | null;
  status: string;
};

/** Skip a scheduled spec when a queued/running run already covers the same account+kind. */
export function shouldSkipDueToActiveRun(spec: ScheduledSyncSpec, activeRuns: ActiveRunScope[]) {
  return activeRuns.some(
    (run) =>
      run.metaAccountId === spec.accountId &&
      run.syncKind === spec.syncKind &&
      (run.status === "queued" || run.status === "running" || run.status === "partial")
  );
}

export function filterRunnableSpecs(specs: ScheduledSyncSpec[], activeRuns: ActiveRunScope[]) {
  const runnable = specs.filter((spec) => !shouldSkipDueToActiveRun(spec, activeRuns));
  return { runnable, skipped: specs.length - runnable.length };
}
