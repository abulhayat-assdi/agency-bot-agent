type LogLevel = "debug" | "info" | "warn" | "error";

type LogValue = string | number | boolean | null | undefined;
type LogContext = Record<string, LogValue | LogValue[] | Record<string, unknown>>;

const SENSITIVE_KEY_PARTS = [
  "access_token",
  "accesstoken",
  "app_secret",
  "appsecret",
  "authorization",
  "api_key",
  "apikey",
  "password",
  "secret",
  "token"
];

function isSensitiveKey(key: string) {
  const normalized = key.toLowerCase().replace(/[^a-z]/g, "");
  return SENSITIVE_KEY_PARTS.some((part) => normalized.includes(part.replace(/[^a-z]/g, "")));
}

function sanitizeValue(value: unknown): unknown {
  if (typeof value === "string") return sanitizeUrlString(value);
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, isSensitiveKey(key) ? "[redacted]" : sanitizeValue(entry)]));
  }
  return value;
}

function sanitizeUrlString(value: string) {
  if (!value.includes("access_token") && !value.includes("appsecret_proof") && !value.includes("secret")) return value;
  try {
    // Handle full URLs that may embed secrets as query params.
    if (/^https?:\/\//i.test(value)) {
      const url = new URL(value);
      for (const key of [...url.searchParams.keys()]) {
        if (isSensitiveKey(key)) url.searchParams.set(key, "[redacted]");
      }
      return url.toString();
    }
  } catch {
    // Fall through to regex redaction.
  }
  return value
    .replace(/(access_token=)[^&\s"']+/gi, "$1[redacted]")
    .replace(/(appsecret_proof=)[^&\s"']+/gi, "$1[redacted]")
    .replace(/("access_token"\s*:\s*")[^"]+(")/gi, "$1[redacted]$2");
}

function sanitize(context: LogContext = {}) {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    result[key] = isSensitiveKey(key) ? "[redacted]" : sanitizeValue(value);
  }
  return result;
}

export function sanitizeLogUrl(url: string) {
  return sanitizeUrlString(url);
}

function write(level: LogLevel, message: string, context?: LogContext) {
  const payload = {
    level,
    message: sanitizeUrlString(message),
    time: new Date().toISOString(),
    ...sanitize(context)
  };

  const line = JSON.stringify(payload);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (message: string, context?: LogContext) => write("debug", message, context),
  info: (message: string, context?: LogContext) => write("info", message, context),
  warn: (message: string, context?: LogContext) => write("warn", message, context),
  error: (message: string, context?: LogContext) => write("error", message, context)
};
