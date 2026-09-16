import type IORedis from "ioredis";

import { createRedisConnection } from "@/server/jobs/redis";
import { logger } from "@/server/observability/logger";

export type ApiRateLimitOptions = {
  limit: number;
  windowMs: number;
};

export type ApiRateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  retryAfterSeconds: number;
};

export type SharedRateLimiter = {
  check(key: string, now?: number): Promise<ApiRateLimitResult>;
  clear(): Promise<void>;
};

type Bucket = {
  count: number;
  resetAt: number;
};

export class InMemoryApiRateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(private readonly options: ApiRateLimitOptions) {}

  check(key: string, now = Date.now()): ApiRateLimitResult {
    const existing = this.buckets.get(key);
    const bucket = !existing || existing.resetAt <= now ? { count: 0, resetAt: now + this.options.windowMs } : existing;
    bucket.count += 1;
    this.buckets.set(key, bucket);

    const allowed = bucket.count <= this.options.limit;
    return {
      allowed,
      remaining: Math.max(this.options.limit - bucket.count, 0),
      resetAt: new Date(bucket.resetAt),
      retryAfterSeconds: Math.max(Math.ceil((bucket.resetAt - now) / 1_000), 0)
    };
  }

  clear() {
    this.buckets.clear();
  }
}

/**
 * Redis-backed fixed-window rate limiter.
 *
 * One Lua script performs INCR + PEXPIRE + PTTL atomically, so concurrent web
 * instances share exact counts with no race. Keys are namespaced per limiter
 * (`rl:{name}:{key}`) with a TTL equal to the window, so storage is bounded.
 * On Redis failure it fails OPEN (availability over strictness for admin
 * tooling) and logs — never throws, never leaks the key.
 */
export class RedisApiRateLimiter {
  constructor(
    private readonly name: string,
    private readonly options: ApiRateLimitOptions,
    private readonly getClient: () => IORedis
  ) {}

  private redisKey(key: string) {
    return `rl:${this.name}:${key}`;
  }

  async check(key: string, now = Date.now()): Promise<ApiRateLimitResult> {
    const redisKey = this.redisKey(key);
    try {
      const client = this.getClient();
      const [countRaw, ttlRaw] = (await client.eval(
        `local current = redis.call('INCR', KEYS[1])
         if current == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
         return {current, redis.call('PTTL', KEYS[1])}`,
        1,
        redisKey,
        String(this.options.windowMs)
      )) as [number, number];
      const count = Number(countRaw);
      const ttl = Number.isFinite(ttlRaw) && ttlRaw > 0 ? ttlRaw : this.options.windowMs;
      const allowed = count <= this.options.limit;
      return {
        allowed,
        remaining: Math.max(this.options.limit - count, 0),
        resetAt: new Date(now + ttl),
        retryAfterSeconds: allowed ? 0 : Math.max(Math.ceil(ttl / 1000), 0)
      };
    } catch (error) {
      logger.warn("Redis rate limiter unavailable; failing open", {
        limiter: this.name,
        errorName: error instanceof Error ? error.name : "unknown"
      });
      return { allowed: true, remaining: this.options.limit, resetAt: new Date(now + this.options.windowMs), retryAfterSeconds: 0 };
    }
  }

  async clear(): Promise<void> {
    try {
      const client = this.getClient();
      const stream = client.scanStream({ match: `rl:${this.name}:*`, count: 100 });
      const keys: string[] = [];
      for await (const batch of stream) keys.push(...(batch as string[]));
      if (keys.length > 0) await client.del(...keys);
    } catch {
      // Test/maintenance helper only; never throw.
    }
  }
}

const sharedLimiters = new Map<string, SharedRateLimiter | InMemoryApiRateLimiter>();
let redisClient: IORedis | null = null;

function getRedisClient(): IORedis {
  if (!redisClient) redisClient = createRedisConnection();
  return redisClient;
}

function redisAvailable(): boolean {
  try {
    return Boolean(process.env.REDIS_URL);
  } catch {
    return false;
  }
}

// Shared limiters resolve to Redis-backed counters when REDIS_URL is set and
// fall back to the in-memory implementation otherwise. The exported names are
// stable so route code and tests keep working unchanged.
export function getSharedRateLimiter(name: string, options: ApiRateLimitOptions): SharedRateLimiter | InMemoryApiRateLimiter {
  const existing = sharedLimiters.get(name);
  if (existing) return existing;
  const limiter = redisAvailable() ? new RedisApiRateLimiter(name, options, getRedisClient) : new InMemoryApiRateLimiter(options);
  sharedLimiters.set(name, limiter);
  return limiter;
}

export async function checkSharedRateLimit(
  limiter: SharedRateLimiter | InMemoryApiRateLimiter,
  key: string
): Promise<ApiRateLimitResult> {
  return limiter.check(key);
}

export const aiAnalystRateLimiter = getSharedRateLimiter("ai-analyst", { limit: 30, windowMs: 60_000 });
export const emailSendRateLimiter = getSharedRateLimiter("email-send", { limit: 10, windowMs: 10 * 60_000 });

export function getClientIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwardedFor || request.headers.get("x-real-ip") || "unknown";
}

export function rateLimitHeaders(result: ApiRateLimitResult) {
  return {
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": result.resetAt.toISOString(),
    "Retry-After": String(result.retryAfterSeconds)
  };
}
