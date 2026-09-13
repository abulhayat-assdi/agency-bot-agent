export const STALE_RUN_THRESHOLD_MINUTES = 60;

export type StaleRunInput = {
  status: string;
  startedAt: Date | string | null;
  createdAt: Date | string;
};

/**
 * A run stuck in "running" past the threshold needs attention — it usually
 * means a worker crashed or lost Redis contact mid-chunk. Never auto-mark it
 * successful; surface it as stale with remediation instead.
 */
export function isRunStale(run: StaleRunInput, now: Date = new Date(), thresholdMinutes: number = STALE_RUN_THRESHOLD_MINUTES) {
  if (run.status !== "running") return false;
  const started = run.startedAt ? new Date(run.startedAt).getTime() : new Date(run.createdAt).getTime();
  if (!Number.isFinite(started)) return false;
  return now.getTime() - started > thresholdMinutes * 60_000;
}

export function staleRunRemediation() {
  return "This run has been active beyond the expected window. Check worker logs and Redis connectivity; completed chunks are preserved, so it is safe to cancel and resume a fresh backfill.";
}
