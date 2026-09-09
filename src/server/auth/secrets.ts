const DEV_SESSION_SECRET = "development-only-session-secret-replace-before-production";

export function getSessionSecret(env: Record<string, string | undefined> = process.env): string {
  const secret = env.SESSION_SECRET;

  if (secret && secret.length >= 32) {
    return secret;
  }

  if (env.APP_ENV === "production" || env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET must be set to at least 32 characters in production");
  }

  return DEV_SESSION_SECRET;
}
