import type IORedis from "ioredis";

import { logger } from "@/server/observability/logger";
import { createRedisConnection } from "@/server/jobs/redis";
import {
  InMemoryApiRateLimiter,
  type ApiRateLimitOptions,
  type ApiRateLimitResult
} from "@/server/security/api-rate-limit";

export type SharedRateLimiter = {
  check(key: string, now?: number): Promise<ApiRateLimitResult>;
  clear(): Promise<void>;
};

/**
 * Redis-backed fixed-window rate limiter.
 *
 * One Lua script performs INCR + PEXPIRE + PTTL atomically, so concurrent web
 * instances share exact counts with no race. Keys are namespaced per limiter
 * (`rl:{name}:{key}`) with a TTL equal to the window, so storage is bounded.
 * On Redis failure it fails OPEN (availability over strictness for admin
 * tooling) and logs once per incident — never throws, never leaks the key.
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

/**
 * Process-wide shared limiter: Redis-backed when REDIS_URL is configured,
 * otherwise the existing in-memory limiter (dev/test/single-instance).
 * Same name always returns the same instance so tests can reset it.
 */
export function getSharedRateLimiter(name: string, options: ApiRateLimitOptions): SharedRateLimiter | InMemoryApiRateLimiter {
  const existing = sharedLimiters.get(name);
  if (existing) return existing;
  const limiter = redisAvailable()
    ? new RedisApiRateLimiter(name, options, getRedisClient)
    : new InMemoryApiRateLimiter(options);
  sharedLimiters.set(name, limiter);
  return limiter;
}

export async function checkSharedRateLimit(
  limiter: SharedRateLimiter | InMemoryApiRateLimiter,
  key: string
): Promise<ApiRateLimitResult> {
  return limiter.check(key);
}
