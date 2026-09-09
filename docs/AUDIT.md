# Audit Notes

Audit date: 2026-09-09.

Scope: Milestones 0-3 foundation, authentication, PostgreSQL/Drizzle schema, documentation, dependency posture, tests, and production-readiness assumptions.

## Findings fixed

### Session architecture

The codebase had both a signed cookie/JWT session implementation and a `sessions` table. Because Phase 1 currently authenticates a bootstrap admin from environment variables and uses Next.js proxy route protection, a DB-backed per-request session check is not yet practical without making local development dependent on PostgreSQL availability for all route access.

Decision: use one coherent architecture now: short-lived signed HTTP-only cookie sessions with minimal identity claims. The unused `sessions` table was removed from the Drizzle schema and a forward migration was generated to drop it from databases that applied the prior migration.

Future DB-backed sessions can be introduced deliberately when admin users are fully database-managed and route protection is designed around a Node runtime/session lookup strategy.

### Login rate limiting

The initial rate limiter was process-local. It now sits behind a `LoginRateLimiter` interface with an in-memory fallback implementation. This keeps local development working while making the production Redis-backed implementation an explicit follow-up in the Redis/BullMQ milestone.

Limitation: until Redis-backed rate limiting is added, rate limits are per application process and reset on deploy/restart.

### Large counters

Metric counters that can exceed 32-bit integer ranges were changed from PostgreSQL `integer` to `bigint` with Drizzle `mode: "number"`:

- impressions
- reach
- clicks
- link clicks
- outbound clicks

Spend, conversion counts, and conversion value remain `numeric(18,6)`. Optional video/engagement/action detail remains JSONB until normalization needs become clearer from the mock and live provider implementations.

## Findings intentionally not changed yet

- Auth users are still bootstrap-env based, not database-backed. This is acceptable until the application has migrations and durable admin-user setup flows. No real passwords are stored in Git.
- Dev tooling has moderate `npm audit` findings through Drizzle Kit transitive dependencies; production dependency audit is clean with `npm audit --omit=dev`.
- UI pages are still route shells until mock provider and analytics engine milestones populate verified data.

## Verification

The audit/hardening patch must pass:

- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`
- `npm audit --omit=dev`
- secret-pattern scan excluding generated/dependency directories
