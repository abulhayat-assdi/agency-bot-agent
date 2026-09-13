export type MetaApiErrorKind =
  | "authentication"
  | "permission"
  | "rate_limit"
  | "invalid_request"
  | "unsupported_breakdown"
  | "not_found"
  | "transient"
  | "network";

export const META_ERROR_KINDS: MetaApiErrorKind[] = [
  "authentication",
  "permission",
  "rate_limit",
  "invalid_request",
  "unsupported_breakdown",
  "not_found",
  "transient",
  "network"
];

export class MetaApiError extends Error {
  constructor(
    message: string,
    readonly kind: MetaApiErrorKind,
    readonly code: string,
    readonly retryable: boolean,
    readonly safeDetails: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = "MetaApiError";
  }
}

const SAFE_USER_MESSAGES: Record<MetaApiErrorKind, string> = {
  authentication: "Meta authentication failed.",
  permission: "Meta permission denied.",
  rate_limit: "Meta API rate limit reached.",
  invalid_request: "Invalid Meta API request.",
  unsupported_breakdown: "Requested breakdown combination is unsupported.",
  not_found: "Requested Meta object was not found.",
  transient: "Meta API temporarily unavailable.",
  network: "Meta API network error."
};

export function toSafeUserMessage(error: unknown): string {
  if (error instanceof MetaApiError) return SAFE_USER_MESSAGES[error.kind] ?? "Meta API temporarily unavailable.";
  return "Meta API temporarily unavailable.";
}
