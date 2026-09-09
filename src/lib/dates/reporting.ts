export type DateRangePreset =
  | "today"
  | "yesterday"
  | "last_3_days"
  | "last_7_days"
  | "last_14_days"
  | "last_28_days"
  | "last_30_days"
  | "this_month"
  | "last_month";

export type ReportingDateRange = {
  since: string;
  until: string;
  timezone: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function getZonedDateString(instant: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(instant);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error(`Unable to resolve local date for timezone ${timezone}`);
  }

  return `${year}-${month}-${day}`;
}

export function addDays(date: string, days: number): string {
  const timestamp = Date.parse(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(timestamp)) throw new Error(`Invalid reporting date ${date}`);
  return new Date(timestamp + days * DAY_MS).toISOString().slice(0, 10);
}

export function startOfMonth(date: string): string {
  return `${date.slice(0, 8)}01`;
}

export function endOfPreviousMonth(date: string): string {
  return addDays(startOfMonth(date), -1);
}

export function resolveDatePreset(preset: DateRangePreset, timezone: string, referenceInstant = new Date()): ReportingDateRange {
  const today = getZonedDateString(referenceInstant, timezone);

  switch (preset) {
    case "today":
      return { since: today, until: today, timezone };
    case "yesterday": {
      const yesterday = addDays(today, -1);
      return { since: yesterday, until: yesterday, timezone };
    }
    case "last_3_days":
      return { since: addDays(today, -2), until: today, timezone };
    case "last_7_days":
      return { since: addDays(today, -6), until: today, timezone };
    case "last_14_days":
      return { since: addDays(today, -13), until: today, timezone };
    case "last_28_days":
      return { since: addDays(today, -27), until: today, timezone };
    case "last_30_days":
      return { since: addDays(today, -29), until: today, timezone };
    case "this_month":
      return { since: startOfMonth(today), until: today, timezone };
    case "last_month": {
      const lastMonthEnd = endOfPreviousMonth(today);
      return { since: startOfMonth(lastMonthEnd), until: lastMonthEnd, timezone };
    }
    default: {
      const exhaustive: never = preset;
      throw new Error(`Unsupported date preset ${exhaustive}`);
    }
  }
}

export function previousEquivalentPeriod(range: ReportingDateRange): ReportingDateRange {
  const start = Date.parse(`${range.since}T00:00:00.000Z`);
  const end = Date.parse(`${range.until}T00:00:00.000Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    throw new Error("Invalid reporting range");
  }
  const days = Math.round((end - start) / DAY_MS) + 1;
  const until = addDays(range.since, -1);
  return { since: addDays(until, -(days - 1)), until, timezone: range.timezone };
}

export function formatDateRange(range: ReportingDateRange) {
  return `${range.since} – ${range.until} (${range.timezone})`;
}

export function hourLabel(hour: number) {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) throw new Error("Hour must be between 0 and 23");
  return `${pad(hour)}:00–${pad(hour)}:59`;
}
