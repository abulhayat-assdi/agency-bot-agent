import type { MetaDateRange } from "@/server/meta/types";

const DAY_MS = 24 * 60 * 60 * 1000;

export function eachDateInRange(range: MetaDateRange): string[] {
  const start = Date.parse(`${range.since}T00:00:00.000Z`);
  const end = Date.parse(`${range.until}T00:00:00.000Z`);

  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    throw new Error("Invalid date range. Expected YYYY-MM-DD since/until with until >= since.");
  }

  const dates: string[] = [];
  for (let cursor = start; cursor <= end; cursor += DAY_MS) {
    dates.push(new Date(cursor).toISOString().slice(0, 10));
  }
  return dates;
}

export function dayOfMonth(date: string) {
  return Number.parseInt(date.slice(8, 10), 10);
}
