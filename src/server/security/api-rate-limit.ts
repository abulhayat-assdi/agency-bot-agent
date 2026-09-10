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

export const aiAnalystRateLimiter = new InMemoryApiRateLimiter({ limit: 30, windowMs: 60_000 });
export const emailSendRateLimiter = new InMemoryApiRateLimiter({ limit: 10, windowMs: 10 * 60_000 });

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
