# Production Deployment Readiness

Target model:

```text
GitHub → Docker image/build → Coolify → Hostinger VPS or equivalent Docker host
```

No production access is required or attempted during development. All secrets must be configured in the deployment platform, never committed to Git.

## Services

The repository runs four operational service types from the same image/source:

| Service | Command | Purpose |
| --- | --- | --- |
| Web | `npm run start:web` | Next.js UI and API routes on port `3000` |
| Worker | `npm run start:worker` | BullMQ read-only sync worker (consumes `meta-sync`) |
| Scheduler | `npm run start:scheduler` | Long-running loop enqueueing incremental syncs every `SYNC_INTERVAL_MINUTES` |
| Migration job | `npm run deploy:migrate` | Runs Drizzle migrations before/around deploy |

The scheduler only enqueues chunked planner jobs; it never calls the Meta API itself. Scheduler restarts are safe: deterministic chunk job IDs plus an active-run check per account prevent duplicate work.

Required backing services:

- PostgreSQL
- Redis (with AOF persistence: `redis-server --appendonly yes`; see Redis section)

## Docker files

- `Dockerfile` — multi-stage Node 22 image with dependency, build, production dependency, and runtime stages.
- `.dockerignore` — excludes Git, local env files, dependencies, caches, and build artifacts.
- `docker-compose.yml` — local smoke/deployment topology for web, worker, scheduler, PostgreSQL, Redis, and migration profile.

The runtime image:

- binds to `0.0.0.0:3000` (web only)
- sets `NEXT_TELEMETRY_DISABLED=1`
- runs as non-root user `nextjs`
- never copies `.env` files (see `.dockerignore`)
- supports web/worker/scheduler via command override without rebuilding
- exposes `/api/health` through a web-service healthcheck (the image itself has no
  HEALTHCHECK because worker/scheduler containers do not serve HTTP)

## Local Docker smoke test

Use placeholder-only local values and replace them in real deployment environments:

```bash
docker compose build
docker compose up -d postgres redis
docker compose --profile tools run --rm migrate
docker compose up -d web worker scheduler
docker compose ps
curl http://localhost:3000/api/health
```

Stop local services:

```bash
docker compose down
```

Remove local volumes only when you intentionally want to delete local data:

```bash
docker compose down -v
```

## Coolify setup

Create separate Coolify services from the same GitHub repository/branch:

1. Web app
   - Build source: this repository
   - Dockerfile: `Dockerfile`
   - Port: `3000`
   - Start command: `npm run start:web` or image default command
   - Health check path: `/api/health`
2. Worker
   - Same repository/image
   - Start command override: `npm run start:worker`
   - No public port required
3. Scheduler
   - Same repository/image
   - Start command override: `npm run start:scheduler`
   - No public port required
4. Migration (pre-deploy command)
   - Run `npm run deploy:migrate` before deploying the web/worker/scheduler services, using a build image that includes dev dependencies or Coolify's build environment.
5. PostgreSQL resource
   - Attach `DATABASE_URL` to web, worker, scheduler, and migration job.
   - Configure backups before production use.
6. Redis resource
   - Attach `REDIS_URL` to web, worker, and scheduler.
   - Enable persistence (AOF) so queued chunk jobs survive restarts.

## Required environment variables

See `.env.example` for the complete list. Production must set at least:

```text
APP_ENV=production
APP_URL=https://your-domain.example
SESSION_SECRET=<long random secret, at least 32 characters>
ADMIN_BOOTSTRAP_EMAIL=<admin email>
ADMIN_BOOTSTRAP_PASSWORD_HASH=<bcrypt hash>
DATABASE_URL=<postgres connection string>
REDIS_URL=<redis connection string>
META_PROVIDER=mock or graph-api
META_GRAPH_API_VERSION=v26.0
META_SYNC_CONCURRENCY=2
BACKFILL_CHUNK_DAYS=7
BACKFILL_MAX_DAYS=400
META_INITIAL_SYNC_DAYS=30
META_INCREMENTAL_LOOKBACK_DAYS=3
SYNC_INTERVAL_MINUTES=60
EMAIL_PROVIDER=mock or resend
```

When enabling live read-only Meta:

```text
META_PROVIDER=graph-api
META_SYSTEM_USER_ACCESS_TOKEN=<read-only system user token>
META_APP_SECRET=<optional app secret for appsecret_proof>
```

When enabling OpenAI/Resend:

```text
OPENAI_API_KEY=<key>
OPENAI_MODEL=gpt-4.1-mini
EMAIL_PROVIDER=resend
RESEND_API_KEY=<key>
EMAIL_FROM=reports@example.com
```

## Security checklist

- Use `ADMIN_BOOTSTRAP_PASSWORD_HASH`; do not use plaintext bootstrap passwords in production.
- Generate `SESSION_SECRET` outside Git.
- Keep `.env` and provider credentials in Coolify secrets only.
- Confirm `META_PROVIDER=graph-api` uses `ads_read` access only for Phase 1.
- Do not configure `ads_management` unless a future phase explicitly introduces write controls and approvals.
- Verify `/api/health` does not expose credentials; it reports readiness booleans only.
- Confirm `/api/meta/health`, `/api/jobs/health`, and sensitive APIs are protected by the existing auth proxy.
- Keep PostgreSQL backups enabled before using live client data.

## Health and readiness endpoints

| Endpoint | Protected | Purpose |
| --- | --- | --- |
| `/api/health` | No | App liveness and safe readiness booleans |
| `/api/ready` | Yes | Deep readiness: app, auth, database reachability, Redis reachability, Meta config (booleans only, 503 when DB unreachable) |
| `/api/meta/health` | Yes | Meta provider mode/version/read-only readiness; `?live=true` performs a safe live check |
| `/api/jobs/health` | Yes | Redis/BullMQ readiness |
| `/api/meta/runs` | Yes | Recent sync runs with chunk progress and stale flags |
| `/api/meta/alerts` | Yes | Structured alert events (stale runs, auth/permission failures, repeated failures) |

## Operational notes

- The web, worker, and scheduler services must share the same environment values.
- Run migrations before routing traffic to a new schema-dependent release.
- The dashboard reads persisted PostgreSQL data once an account has synced; never-synced accounts show an explicit "No synchronized data yet" banner instead of silent mock numbers (mock data only appears in non-production or unconnected states, always labeled).
- The live Graph provider and BullMQ worker are ready for read-only provider calls when environment credentials are configured.
- API rate limiting is currently in-memory. Use one web replica or replace with Redis-backed rate limiting before horizontal scaling.
- Production CSP/frame policy should be finalized after the real domain and embedding requirements are known.

## Database migration runbook

1. **Backup/check.** Snapshot PostgreSQL in Coolify (or `pg_dump`) and confirm the current image tag so you can roll back.
2. **Migration.** Run `npm run deploy:migrate` (Drizzle `migrate`, never `db:push`) against the production `DATABASE_URL` before starting new web/worker/scheduler containers.
3. **Verification.** Check the `__drizzle_migrations` table and start one container with `npm run deploy:check`; confirm `/api/ready` returns 200 with `database.reachable: true`.
4. **Application startup.** Deploy web, then worker, then scheduler. Never reset the schema (`down -v`, `migrate:drop`) in production.

## PostgreSQL backups and recovery

- Coolify PostgreSQL: enable scheduled backups and test a restore to a scratch database quarterly; document the restore command in the team runbook.
- `docker-compose` local stack: volumes `postgres-data`/`redis-data` persist across restarts; back up with `docker compose exec postgres pg_dump -U postgres meta_ads_intelligence > backup.sql`.
- Migration recovery: if a migration fails mid-deploy, keep the previous image running, fix forward with a new migration, and re-run `deploy:migrate`. Rollback of code without rolling back an applied migration is only safe if the migration is backward compatible.
- Secret recovery: all credentials live in Coolify env configuration only. There is no in-repo copy; rotate a secret by updating Coolify and redeploying.

## Redis persistence and resources

- Production Redis must run with AOF persistence (`--appendonly yes`) so queued chunk jobs survive restarts. BullMQ completed/failed history is retained 14/30 days by queue policy.
- Treat Redis as a transport, not a source of truth: sync checkpoints live in PostgreSQL (`sync_runs.checkpoint`), so a cold Redis only delays work, never loses sync progress. No secrets are ever stored in job payloads.
- Safe starting limits: `META_SYNC_CONCURRENCY=2`, one worker replica, default Node heap. Raise concurrency only after observing Meta throttle behavior and DB pool headroom (pool max is 10; each sync holds at most one connection at a time plus query bursts).

## Stale runs and alerting

- Runs stuck in `running` past 60 minutes surface as `stale: true` (with remediation) in run views and the Sync operations UI. They are never auto-marked successful; cancel and resume instead — completed chunks are preserved.
- `GET /api/meta/alerts` derives structured events (`sync_stale`, `sync_failed[_repeatedly]`, `meta_auth_failure`, `meta_permission_failure`) from persisted runs and logs them for external providers. To page a human, forward these events to PagerDuty/Opsgenie/a webhook — the `AlertEvent` shape in `src/server/sync/alerts.ts` is the integration point; no notification vendor is wired yet.

## Production go-live runbook

1. Configure Coolify services (web, worker, scheduler, migration) from this branch.
2. Attach PostgreSQL and Redis resources; enable backups and AOF persistence.
3. Set all environment variables listed above (generate `SESSION_SECRET`, use password hash, `META_PROVIDER=graph-api` only with a read-only token).
4. Run migrations (`npm run deploy:migrate`); verify with `npm run deploy:check`.
5. Deploy web; verify `/api/health` (public) and `/api/ready` (authed, 200).
6. Verify Meta connection: `GET /api/meta/health?live=true` → `connected`.
7. Run live smoke: `META_LIVE_TEST=true npm run meta:live-smoke` (explicit, read-only).
8. Run a 7-day sync for the verified test account via Sync operations (or `POST /api/meta/sync`).
9. Verify PostgreSQL rows (`ad_accounts`, `campaigns`, `ad_sets`, `ads`, `metric_daily`, `breakdown_metric_daily`, `raw_ingestion_records`, `data_availability`, `sync_runs`) and cross-check spend/impressions/reach/clicks against the Meta API for the same range/timezone.
10. Verify the dashboard shows persisted data with no mock mixing.
11. Verify Sync operations shows the real run with chunks and duration.
12. Run a small (14-day) backfill; verify planner → chunks → checkpoint → finalize.
13. Test resume by retrying a failed chunk; verify completed chunks are not repeated.
14. Deploy the worker and scheduler; confirm the scheduler enqueues incrementals without duplicates after restart.
15. Enable the normal schedule and monitor `/api/meta/alerts`.

Never document real secrets. Live smoke and syncs are read-only (`ads_read`); no Meta asset is ever created, edited, or paused.

## Rollback

Use Coolify's previous deployment/image rollback feature. If a schema migration has already run, verify rollback compatibility before switching traffic back to an older image.
