export const SESSION_COOKIE_NAME = "agency_ai_session";
export const SESSION_DURATION_SECONDS = 60 * 60 * 8;

export const PROTECTED_PATH_PREFIXES = [
  "/",
  "/dashboard",
  "/clients",
  "/ad-accounts",
  "/breakdowns",
  "/trends",
  "/ai-analyst",
  "/reports",
  "/email-reports",
  "/settings"
] as const;

export const PUBLIC_PATH_PREFIXES = ["/login", "/api/health"] as const;
