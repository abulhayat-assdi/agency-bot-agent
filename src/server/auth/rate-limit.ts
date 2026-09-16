import type IORedis from "ioredis";

import { createRedisConnection } from "@/server/jobs/redis";
import { logger } from "@/server/observability/logger";

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
};

export interface LoginRateLimiter {
  check(key: string, now?: number): Promise<RateLimitResult> | RateLimitResult;
  reset(key: string): Promise<void> | void;
}

type Attempt = {
  count: number;
  resetAt: number;
};

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export class InMemoryLoginRateLimiter implements LoginRateLimiter {
  private readonly attempts = new Map<string, Attempt>();

  constructor(
    private readonly maxAttempts = MAX_ATTEMPTS,
    private readonly windowMs = WINDOW_MS
  ) {}

  check(key: string, now = Date.now()): RateLimitResult {
    const existing = this.attempts.get(key);

    if (!existing || existing.resetAt <= now) {
      this.attempts.set(key, { count: 1, resetAt: now + this.windowMs });
      return { allowed: true, remaining: this.maxAttempts - 1, resetAt: now + this.windowMs };
    }

    if (existing.count >= this.maxAttempts) {
      return { allowed: false, remaining: 0, resetAt: existing.resetAt };
    }

    existing.count += 1;
    this.attempts.set(key, existing);
    return { allowed: true, remaining: this.maxAttempts - existing.count, resetAt: existing.resetAt };
  }

  reset(key: string) {
    this.attempts.delete(key);
  }
}

const fallbackLimiter = new InMemoryLoginRateLimiter();

/**
 * Redis-backed login throttling shared across web instances. Falls back to
 * the process-local limiter without Redis. On Redis failure it fails OPEN for
 * availability (failed passwords still don't authenticate) and logs.
 */
export class RedisLoginRateLimiter implements LoginRateLimiter {
  constructor(
    private readonly getClient: () => IORedis,
    private readonly maxAttempts = MAX_ATTEMPTS,
    private readonly windowMs = WINDOW_MS
  ) {}

  private keyFor(key: string) {
    return `rl:login:${key}`;
  }

  async check(key: string, now = Date.now()): Promise<RateLimitResult> {
    try {
      const client = this.getClient();
      const [countRaw, ttlRaw] = (await client.eval(
        `local current = redis.call('INCR', KEYS[1])
         if current == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
         return {current, redis.call('PTTL', KEYS[1])}`,
        1,
        this.keyFor(key),
        String(this.windowMs)
      )) as [number, number];
      const count = Number(countRaw);
      const ttl = Number.isFinite(ttlRaw) && ttlRaw > 0 ? ttlRaw : this.windowMs;
      return {
        allowed: count <= this.maxAttempts,
        remaining: Math.max(this.maxAttempts - count, 0),
        resetAt: now + ttl
      };
    } catch (error) {
      logger.warn("Redis login limiter unavailable; failing open", {
        errorName: error instanceof Error ? error.name : "unknown"
      });
      return { allowed: true, remaining: this.maxAttempts, resetAt: now + this.windowMs };
    }
  }

  async reset(key: string): Promise<void> {
    try {
      await this.getClient().del(this.keyFor(key));
    } catch {
      // Best effort only.
    }
  }
}

let redisLoginClient: IORedis | null = null;

export function getLoginRateLimiter(): LoginRateLimiter {
  if (process.env.REDIS_URL) {
    if (!redisLoginClient) redisLoginClient = createRedisConnection();
    return new RedisLoginRateLimiter(() => redisLoginClient as IORedis);
  }
  return fallbackLimiter;
}

export function checkLoginRateLimit(key: string, now = Date.now()) {
  return getLoginRateLimiter().check(key, now);
}

export function resetLoginRateLimit(key: string) {
  return getLoginRateLimiter().reset(key);
}
