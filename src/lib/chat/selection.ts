/** Chat composer selection, shared by the client view and the server page. */
export type ChatSelectionState = { accountId: string | null; preset: string; since: string; until: string };

export const SELECTION_COOKIE = "agency-ai-chat-selection";

export const CHAT_PRESETS = ["today", "yesterday", "last_7_days", "last_14_days", "last_30_days", "this_month", "last_month", "custom"] as const;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Parses the saved cookie defensively; unknown accounts or presets fall back to defaults. */
export function parseSelection(raw: string | undefined, accountIds: string[]): ChatSelectionState {
  const fallback: ChatSelectionState = { accountId: accountIds[0] ?? null, preset: "last_7_days", since: "", until: "" };
  if (!raw) return fallback;
  try {
    const saved = JSON.parse(decodeURIComponent(raw)) as Partial<ChatSelectionState>;
    return {
      accountId: typeof saved.accountId === "string" && accountIds.includes(saved.accountId) ? saved.accountId : fallback.accountId,
      preset: CHAT_PRESETS.includes(saved.preset as (typeof CHAT_PRESETS)[number]) ? saved.preset! : fallback.preset,
      since: typeof saved.since === "string" && DATE_RE.test(saved.since) ? saved.since : "",
      until: typeof saved.until === "string" && DATE_RE.test(saved.until) ? saved.until : ""
    };
  } catch {
    return fallback;
  }
}
