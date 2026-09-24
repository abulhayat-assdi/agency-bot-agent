import { z } from "zod";

const envSchema = z.object({
  APP_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  APP_NAME: z.string().min(1).default("AI Meta Ads Intelligence Platform"),
  SESSION_SECRET: z.string().min(32).optional(),
  ADMIN_BOOTSTRAP_EMAIL: z.string().email().optional(),
  ADMIN_BOOTSTRAP_PASSWORD: z.string().min(8).optional(),
  ADMIN_BOOTSTRAP_PASSWORD_HASH: z.string().optional(),
  DATABASE_URL: z.string().min(1).optional(),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
  REDIS_URL: z.string().min(1).optional(),
  SYNC_INTERVAL_MINUTES: z.coerce.number().int().positive().default(60),
  BACKFILL_CHUNK_DAYS: z.coerce.number().int().min(1).max(31).default(7),
  BACKFILL_MAX_DAYS: z.coerce.number().int().min(1).max(730).default(400),
  META_SYNC_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(2),
  META_INITIAL_SYNC_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  META_INCREMENTAL_LOOKBACK_DAYS: z.coerce.number().int().min(1).max(30).default(3),
  META_GRAPH_API_VERSION: z.string().regex(/^v\d+\.\d+$/).default("v26.0"),
  META_PROVIDER: z.enum(["mock", "graph-api"]).default("mock"),
  META_APP_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  META_SYSTEM_USER_ACCESS_TOKEN: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-4.1-mini"),
  // Any OpenAI-compatible chat completions endpoint, e.g. https://openrouter.ai/api/v1
  OPENAI_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
  EMAIL_PROVIDER: z.enum(["resend", "mock"]).default("mock"),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().email().optional()
});

export type AppConfig = z.infer<typeof envSchema>;

export function getAppConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  // Compose passes unset optional vars as "" (`${VAR:-}`); treat those as unset
  // so defaults apply and optional validators (e.g. EMAIL_FROM email) don't fail.
  const normalized = Object.fromEntries(Object.entries(env).filter(([, value]) => value !== ""));
  const parsed = envSchema.safeParse(normalized);

  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }

  return parsed.data;
}

export function getRuntimeReadiness(config: AppConfig) {
  return {
    app: true,
    authConfigured: Boolean(config.ADMIN_BOOTSTRAP_EMAIL && (config.ADMIN_BOOTSTRAP_PASSWORD || config.ADMIN_BOOTSTRAP_PASSWORD_HASH)),
    databaseConfigured: Boolean(config.DATABASE_URL),
    redisConfigured: Boolean(config.REDIS_URL),
    metaProvider: config.META_PROVIDER,
    metaConfigured: config.META_PROVIDER === "mock" || Boolean(config.META_SYSTEM_USER_ACCESS_TOKEN),
    aiConfigured: Boolean(config.OPENAI_API_KEY),
    emailConfigured: config.EMAIL_PROVIDER === "mock" || Boolean(config.RESEND_API_KEY && config.EMAIL_FROM)
  };
}
