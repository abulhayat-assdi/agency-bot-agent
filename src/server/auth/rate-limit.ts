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

export function getLoginRateLimiter(): LoginRateLimiter {
  // Production Redis-backed implementation is intentionally deferred until the Redis/BullMQ milestone.
  // Keeping this behind an interface prevents auth code from being tied to process-local state.
  return fallbackLimiter;
}

export function checkLoginRateLimit(key: string, now = Date.now()) {
  return getLoginRateLimiter().check(key, now);
}

export function resetLoginRateLimit(key: string) {
  return getLoginRateLimiter().reset(key);
}
