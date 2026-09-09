import { z } from "zod";

const envSchema = z.object({
  APP_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  APP_NAME: z.string().min(1).default("AI Meta Ads Intelligence Platform"),
  SESSION_SECRET: z.string().min(32).optional(),
  DATABASE_URL: z.string().min(1).optional(),
  REDIS_URL: z.string().min(1).optional(),
  SYNC_INTERVAL_MINUTES: z.coerce.number().int().positive().default(60),
  META_GRAPH_API_VERSION: z.string().regex(/^v\d+\.\d+$/).default("v26.0"),
  META_PROVIDER: z.enum(["mock", "graph-api"]).default("mock"),
  META_APP_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  META_SYSTEM_USER_ACCESS_TOKEN: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-4.1-mini"),
  EMAIL_PROVIDER: z.enum(["resend", "mock"]).default("mock"),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().email().optional()
});

export type AppConfig = z.infer<typeof envSchema>;

export function getAppConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);

  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }

  return parsed.data;
}

export function getRuntimeReadiness(config: AppConfig) {
  return {
    app: true,
    databaseConfigured: Boolean(config.DATABASE_URL),
    redisConfigured: Boolean(config.REDIS_URL),
    metaProvider: config.META_PROVIDER,
    metaConfigured: config.META_PROVIDER === "mock" || Boolean(config.META_SYSTEM_USER_ACCESS_TOKEN),
    aiConfigured: Boolean(config.OPENAI_API_KEY),
    emailConfigured: config.EMAIL_PROVIDER === "mock" || Boolean(config.RESEND_API_KEY && config.EMAIL_FROM)
  };
}
