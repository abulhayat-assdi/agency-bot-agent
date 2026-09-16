/**
 * Backward-compatible re-exports. The canonical rate-limit implementations
 * live in `@/server/security/api-rate-limit`; this module exists so existing
 * imports (sync/backfill routes, tests) keep working unchanged.
 */
export {
  checkSharedRateLimit,
  getSharedRateLimiter,
  InMemoryApiRateLimiter,
  RedisApiRateLimiter,
  type ApiRateLimitOptions,
  type ApiRateLimitResult,
  type SharedRateLimiter
} from "@/server/security/api-rate-limit";
