export type MetaApiErrorKind = "rate_limit" | "unsupported_breakdown" | "permission" | "not_found" | "transient" | "invalid_request";

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
