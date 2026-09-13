export const MAX_ANALYTICS_RANGE_DAYS = 400;
export const ENTITY_PAGE_DEFAULT_LIMIT = 50;
export const ENTITY_PAGE_MAX_LIMIT = 200;
export const ANALYTICS_ROW_LIMIT_MAX = 5000;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function daysBetween(since: string, until: string) {
  return Math.round((Date.parse(`${until}T00:00:00.000Z`) - Date.parse(`${since}T00:00:00.000Z`)) / 86_400_000) + 1;
}

/**
 * Guard interactive analytics reads against pathological ranges (1y/5y/10y).
 * Large history belongs to the async backfill workflow, never to a
 * synchronous dashboard query. Throws a safe, user-facing error.
 */
export function assertAnalyticsRange(since: string, until: string, maxDays: number = MAX_ANALYTICS_RANGE_DAYS) {
  if (!DATE_RE.test(since) || !Number.isFinite(Date.parse(`${since}T00:00:00.000Z`))) {
    throw new Error("Invalid analytics date range: bad start date");
  }
  if (!DATE_RE.test(until) || !Number.isFinite(Date.parse(`${until}T00:00:00.000Z`))) {
    throw new Error("Invalid analytics date range: bad end date");
  }
  if (until < since) throw new Error("Invalid analytics date range: end is before start");
  const days = daysBetween(since, until);
  if (days > maxDays) {
    throw new Error(`Analytics range of ${days} days exceeds the ${maxDays}-day interactive limit; use backfill for large history`);
  }
  return days;
}

/** Entity listings: default 50, hard cap 200. */
export function clampPageLimit(limit?: number, fallback: number = ENTITY_PAGE_DEFAULT_LIMIT) {
  if (limit === undefined || limit === null) return fallback;
  if (!Number.isFinite(limit)) return fallback;
  return Math.max(1, Math.min(Math.floor(limit), ENTITY_PAGE_MAX_LIMIT));
}

export function clampPageOffset(offset?: number) {
  if (offset === undefined || offset === null || !Number.isFinite(offset)) return 0;
  return Math.max(0, Math.floor(offset));
}

/** Raw row reads: hard cap 5000 regardless of caller. */
export function clampRowLimit(limit?: number, fallback: number = ANALYTICS_ROW_LIMIT_MAX) {
  if (limit === undefined || limit === null) return Math.min(fallback, ANALYTICS_ROW_LIMIT_MAX);
  if (!Number.isFinite(limit)) return Math.min(fallback, ANALYTICS_ROW_LIMIT_MAX);
  return Math.max(1, Math.min(Math.floor(limit), ANALYTICS_ROW_LIMIT_MAX));
}
