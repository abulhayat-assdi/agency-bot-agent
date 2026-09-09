type LogLevel = "debug" | "info" | "warn" | "error";

type LogContext = Record<string, string | number | boolean | null | undefined>;

const REDACTED_KEYS = new Set(["token", "accessToken", "password", "secret", "apiKey", "authorization"]);

function sanitize(context: LogContext = {}) {
  return Object.fromEntries(
    Object.entries(context).map(([key, value]) => [key, REDACTED_KEYS.has(key) ? "[redacted]" : value])
  );
}

function write(level: LogLevel, message: string, context?: LogContext) {
  const payload = {
    level,
    message,
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
