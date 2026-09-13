export type ReportingSource = "persisted" | "mock" | "empty";

/**
 * Production policy for what analytics may display.
 *
 * - persisted: at least one synced account is selected — mock values must never
 *   be mixed into the result.
 * - mock: development/demo mode with no synced accounts selected.
 * - empty: production with a live provider but nothing ever synced — the UI
 *   must say "No synchronized data yet" instead of showing mock numbers.
 */
export function resolveReportingSource(input: {
  appEnv: string;
  metaProvider: "mock" | "graph-api";
  hasPersistedSelection: boolean;
  hasMockSelection: boolean;
}): ReportingSource {
  if (input.hasPersistedSelection) return "persisted";
  if (input.appEnv === "production" && input.metaProvider === "graph-api") return "empty";
  if (input.hasMockSelection) return "mock";
  return "empty";
}
