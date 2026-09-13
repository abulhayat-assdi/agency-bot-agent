import { logger } from "@/server/observability/logger";

export type AlertSeverity = "warning" | "critical";

export type AlertEvent = {
  code:
    | "sync_failed"
    | "sync_failed_repeatedly"
    | "sync_stale"
    | "meta_auth_failure"
    | "meta_permission_failure"
    | "database_unavailable"
    | "redis_unavailable";
  severity: AlertSeverity;
  title: string;
  detail: string;
  remediation: string;
  runId?: string | null;
  metaAccountId?: string | null;
  at: string;
};

export type AlertRunInput = {
  id: string;
  status: string;
  type: string;
  errorSummary: string | null;
  checkpoint?: unknown;
  startedAt?: Date | string | null;
  createdAt: Date | string;
};

export type AlertErrorInput = {
  category: string;
  safeMessage: string;
  retryable: boolean;
};

function metaAccountOf(run: AlertRunInput): string | null {
  const checkpoint = run.checkpoint as { metaAccountId?: unknown } | null | undefined;
  return typeof checkpoint?.metaAccountId === "string" ? checkpoint.metaAccountId : null;
}

/**
 * Derive minimal production alerts from persisted sync state. Pure function so
 * it can feed logs today and an external provider (PagerDuty/Opsgenie/webhook)
 * tomorrow without changing call sites.
 */
export function evaluateRunAlerts(
  runs: AlertRunInput[],
  errorsByRunId: Record<string, AlertErrorInput[]>,
  options: { staleThresholdMinutes?: number; now?: Date } = {}
): AlertEvent[] {
  const now = options.now ?? new Date();
  const events: AlertEvent[] = [];

  for (const run of runs) {
    const metaAccountId = metaAccountOf(run);
    const errors = errorsByRunId[run.id] ?? [];

    if (run.status === "running") {
      const started = run.startedAt ? new Date(run.startedAt).getTime() : new Date(run.createdAt).getTime();
      const threshold = (options.staleThresholdMinutes ?? 60) * 60_000;
      if (Number.isFinite(started) && now.getTime() - started > threshold) {
        events.push({
          code: "sync_stale",
          severity: "warning",
          title: "Sync run appears stale",
          detail: `Run ${run.id} has been active beyond the expected window.`,
          remediation: "Check worker logs and Redis connectivity; cancel and resume if the worker is gone. Completed chunks are preserved.",
          runId: run.id,
          metaAccountId,
          at: now.toISOString()
        });
      }
      continue;
    }

    if (run.status !== "failed") continue;

    const authFailure = errors.some((error) => error.category === "authentication");
    const permissionFailure = errors.some((error) => error.category === "permission");
    if (authFailure) {
      events.push({
        code: "meta_auth_failure",
        severity: "critical",
        title: "Meta authentication failure",
        detail: `Run ${run.id} failed: the Meta credential is invalid or expired.`,
        remediation: "Rotate META_SYSTEM_USER_ACCESS_TOKEN in Coolify and retry. No code change is needed.",
        runId: run.id,
        metaAccountId,
        at: now.toISOString()
      });
      continue;
    }
    if (permissionFailure) {
      events.push({
        code: "meta_permission_failure",
        severity: "critical",
        title: "Meta permission failure",
        detail: `Run ${run.id} failed: the token lacks ads_read on this ad account.`,
        remediation: "Reconnect/update Meta permissions for the ad account, then resume the sync.",
        runId: run.id,
        metaAccountId,
        at: now.toISOString()
      });
      continue;
    }
    events.push({
      code: "sync_failed",
      severity: errors.length >= 3 ? "critical" : "warning",
      title: errors.length >= 3 ? "Sync failed repeatedly" : "Sync failed",
      detail: `Run ${run.id} failed${run.errorSummary ? `: ${run.errorSummary}` : "."}`,
      remediation: "Inspect the run in Sync operations for the failing stage/chunk, then resume; completed chunks are preserved.",
      runId: run.id,
      metaAccountId,
      at: now.toISOString()
    });
  }

  return events;
}

/** Structured alert logging — the integration point for external providers. */
export function logAlertEvents(events: AlertEvent[]) {
  for (const event of events) {
    logger.error(`Sync alert [${event.code}] ${event.title}`, {
      alertCode: event.code,
      severity: event.severity,
      runId: event.runId ?? null,
      accountId: event.metaAccountId ?? null
    });
  }
}
