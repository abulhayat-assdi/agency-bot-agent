# Production Verification Ledger

Milestone M10 gate record plus the M11 live local-stack execution below. No
secrets are stored in this file. Result vocabulary: **PASS** (executed with
evidence), **FAIL** (executed, did not meet expectation), **BLOCKED** (could
not execute: a required credential/service is unavailable), **NOT VERIFIED**
(not attempted or static review only).

## Ledger — M10 execution (2026-09-15, local dev shell, commit `c7e0da6`)

Environment notes: the execution shell exported none of the service
credentials (`DATABASE_URL`, `REDIS_URL`, `META_SYSTEM_USER_ACCESS_TOKEN` all
absent; a `.env.local` file exists but was never read). Live gates below
therefore could not execute. Nothing was fabricated.

### Local validation — all PASS

| Check | Result | Evidence |
|-------|--------|----------|
| `npm test` | PASS | 35 files, 209/209 tests passed |
| `npm run typecheck` | PASS | `tsc --noEmit`, exit 0 |
| `npm run lint` | PASS | `eslint .`, exit 0 |
| `npm run build` | PASS | Next.js production build compiled successfully |
| `npm run deploy:check` | PASS | 19/19 deployment readiness checks |

### Database

| Check | Result | Evidence |
|-------|--------|----------|
| Migration 0002 review (`drizzle/0002_m9-email-ai-audit-depth.sql`) | PASS (static) | 8 statements, all additive nullable columns/defaults; journaled as idx 2 in `drizzle/meta/_journal.json`; no table rebuilds, no data loss possible from DDL alone |
| Migration 0002 live apply | BLOCKED | No credentialed PostgreSQL reachable from this execution context |
| Existing-data intactness after migrate | BLOCKED | Same reason; runbook requires backup first (`docs/DEPLOYMENT.md`) |
| Postgres connectivity/read-write/transactions | NOT VERIFIED | Requires credentialed environment |

### Redis / BullMQ

| Check | Result | Evidence |
|-------|--------|----------|
| Redis connectivity / BullMQ queue/worker/scheduler wiring | NOT VERIFIED | Requires `REDIS_URL`; code path reviewed only (`scripts/sync-worker.ts`, `scripts/scheduler.ts`, `src/server/jobs/*`) |
| Redis AOF persistence | NOT VERIFIED | Compose declares `--appendonly yes`; Coolify resource setting unverified |
| Redis-backed rate limiter (sync/backfill/AI/email/login) | PASS (unit) | `m8-hardening.test.ts` + `m9-product-depth.test.ts` cover atomic Lua path, fail-open, and shared singletons with fakes |

### Meta live verification

| Check | Result | Evidence |
|-------|--------|----------|
| `META_LIVE_TEST=true npm run meta:live-smoke` (`/me`, `/me/adaccounts`, Insights) | NOT EXECUTED | No `META_SYSTEM_USER_ACCESS_TOKEN` in this context; smoke script correctly gates on the flag and never prints tokens (code-reviewed) |
| Account discovery (`act_600432049200435` as test target only) | NOT EXECUTED | Same blocker; account ID appears nowhere in `src/` or `scripts/` (scan clean) |
| Controlled 7-day async sync (queue → worker → Postgres) | NOT EXECUTED | Requires token + Redis + Postgres |
| Sync idempotency re-run | NOT EXECUTED | Covered by unit/integration tests only (`m5-persistence`, `m6-backfill`) |
| Breakdown cross-checks | NOT EXECUTED | Unit-covered only |

### Data / analytics / dashboard / AI / email (live)

| Check | Result | Evidence |
|-------|--------|----------|
| Persisted rows in `ad_accounts` … `sync_runs` | NOT VERIFIED | Requires live sync |
| Meta vs Postgres metric cross-check | NOT VERIFIED | Requires live sync |
| Dashboard on real data (no mock mixing) | NOT VERIFIED | Logic reviewed (`source` metadata + unsynced exclusion); no live data to render |
| AI grounding + conversation persistence + usage on real data | NOT VERIFIED | Unit-covered (`m9-product-depth.test.ts`: 24 tests); no live provider call made |
| Email persistence + scheduled delivery + logs + retries + claim race | NOT VERIFIED live | Unit-covered (claim-once, duplicate guard, attempt counts); no live send performed and none attempted |
| Audit rows for live actions | NOT VERIFIED live | Unit-covered (scrub + never-throws); no live traffic in this context |

### Health / readiness matrix (live)

| Check | Result | Evidence |
|-------|--------|----------|
| `/api/health`, `/api/ready`, `/api/meta/health[?live]`, `/api/jobs/health` against live deps | NOT VERIFIED | Endpoints reviewed; `/api/ready` 503-without-secrets path is unit-tested (`m8-hardening.test.ts`) |
| Stale-run surfacing, alert events | NOT VERIFIED live | Unit-covered (`m7-deploy.test.ts`) |

### Backup / restore

| Check | Result | Evidence |
|-------|--------|----------|
| Backup created / readable / restored / app reconnected | NOT VERIFIED | Drill documented in `docs/DEPLOYMENT.md` ("Backup/restore drill", marked NOT yet executed); no safe restore target exists here |

### Docker / Coolify (static review — PASS)

| Check | Result | Evidence |
|-------|--------|----------|
| Multi-stage build, non-root `nextjs` user | PASS | `Dockerfile` (base/deps/builder/prod-deps/runner) |
| No `.env` in image | PASS | `.dockerignore` excludes `.env`/`.env.*` (keeps `.env.example`); `.gitignore` matches |
| web/worker/scheduler/migrate/postgres/redis topology | PASS | `docker-compose.yml` (scheduler + AOF Redis present); web-only healthcheck (image has none on purpose) |
| Graceful shutdown | PASS (code review) | Shared shutdown coordinator in worker + scheduler; BullMQ/DB/Redis closers registered |
| Coolify configuration itself | NOT VERIFIED | No access from this context; runbook in `docs/DEPLOYMENT.md` |

### Security scan (2026-09-15, tracked files)

| Check | Result | Evidence |
|-------|--------|----------|
| Token/key/private-key patterns in `src/`, `scripts/`, `docs/` | PASS | `git grep` clean |
| Hardcoded test account in prod logic | PASS | `git grep 600432049200435` clean |
| Meta write methods (`POST/PUT/PATCH/DELETE` in provider/sync) | PASS | `git grep` clean; provider is GET-only by construction + test |

## Tally (M10 execution)

- PASS: 12 (5 local validation + migration static review + Redis-limiter units + Docker/image/git hygiene + 3 security scans)
- FAIL: 0
- BLOCKED: 4 (migration apply, data intactness, Postgres live, Redis live — all need credentials)
- NOT VERIFIED: all live Meta/data/dashboard/AI/email/audit/health/backup items above

## Blockers

- **EXTERNAL PROVIDER / CONFIGURATION**: `META_SYSTEM_USER_ACCESS_TOKEN` unavailable here (Meta System User issuance is the known upstream issue; do not work around it in code).
- **OPERATIONAL VERIFICATION**: no credentialed Postgres/Redis/Coolify reachable from this context; backup drill needs a safe restore target.
- **CODE**: none found. No code changes were required by M10.

## How to complete the remaining gates

In an environment with Coolify-provided credentials (never paste secrets into chat or code):
1. `npm run deploy:migrate` → confirm `__drizzle_migrations` contains `0002`.
2. `META_LIVE_TEST=true npm run meta:live-smoke` → expect `/me`, adaccounts, Insights OK.
3. `POST /api/meta/sync` (7-day range, test account) → watch `/sync` run to `success`/`partial`.
4. Cross-check `metric_daily` vs Insights for spend/impressions/reach/clicks; confirm dashboard `source: persisted`.
5. Create an email report + recipient via `/email-reports`; force a scheduler tick; confirm one delivery log, no duplicates on re-tick.
6. Ask the AI analyst twice in one conversation; confirm history persists and usage is recorded or `null`.
7. Run the backup/restore drill from `docs/DEPLOYMENT.md`; update this ledger with dated PASS rows.

---

## Ledger — M11 execution (2026-09-15, local Docker stack, mock Meta provider)

Environment: Docker Desktop became available mid-session, so the documented
`docker-compose` procedure was executed against a **local throwaway stack**
(`agency-bot-agent` project; unrelated containers untouched). Meta ran in
`mock` mode — no Meta token exists anywhere here, so all real-Meta gates stay
honestly NOT EXECUTED. Local admin credential was a throwaway bcrypt hash;
port 3001 was used to avoid a host collision. No secrets committed; temp files
removed afterward.

### Local validation — all PASS (re-run with M11 fixes)

| Check | Result | Evidence |
|-------|--------|----------|
| `npm test` | PASS | 35 files, 210/210 tests passed (+1 UUID regression test) |
| `npm run typecheck` / `lint` / `build` / `deploy:check` | PASS | exit 0 / exit 0 / compiled / 19/19 |

### Code defects found and fixed live (Phase 16)

| Defect | Result | Evidence |
|--------|--------|----------|
| `scripts/scheduler.ts` top-level await crash-looped under CJS tsx in the prod image | PASS (fixed + verified) | Scheduler container `Restarting` → stable `Up` after wrapping startup in `void main()`; first tick completed |
| Same TLA defect in `scripts/schedule-sync.ts` | PASS (fixed) | Script executes (fails fast correctly without `REDIS_URL`); typecheck clean |
| BullMQ custom job IDs containing `:` rejected (`Custom Id cannot contain :`) — broke ALL queue enqueue paths | PASS (fixed + verified) | Separator changed to `|` in `chunks.ts` + `queues.ts` (3 legacy IDs); regression assertion added to `m6-backfill.test.ts`; queued sync + scheduler tick succeed live |
| Bootstrap session id (`bootstrap-admin`) vs UUID FK columns broke audit writes, AI persistence, AI analyst | PASS (fixed + verified) | `toUuidOrNull` normalization in audit + AI repo + run creation; `meta.sync.trigger` and AI conversation persist live; regression test added |

### Database (live, local Postgres 17)

| Check | Result | Evidence |
|-------|--------|----------|
| `deploy:migrate` applies 0002 | PASS | `__drizzle_migrations` holds all 3 hashes; `email_reports.next_run_at`, `ai_messages.provider/model/usage_json` columns present |
| Seed + read/write | PASS | 1 agency / 1 client / 1 account seeded; sync persisted 2 accounts, 3 campaigns, 6 ad sets, 12 ads, 154+ `metric_daily`, 336 breakdown rows, 12 raw records, 78 availability rows |
| Idempotent re-sync | PASS | Repeat of identical 7-day sync: `metric_daily` count stable at 154; zero duplicate scope rows |

### Redis / BullMQ / processes (live)

| Check | Result | Evidence |
|-------|--------|----------|
| Redis PING, queue add/consume | PASS | Planner + chunk jobs flow; `/api/jobs/health` shows live counts (`completed: 6, failed: 0`) |
| Worker (concurrency 2) | PASS | Consumes chunks; run finalized `partial` (expected: mock unavailable states) in ~2.6s |
| Scheduler (60-min loop + boot tick) | PASS | Ticks complete; dedup observed (`enqueued: 0, skipped: 2` on re-tick); email tick delivered 1/1 |
| AOF on Coolify resource | NOT VERIFIED | Compose declares it; production resource out of reach |

### App endpoints (live, authenticated)

| Check | Result | Evidence |
|-------|--------|----------|
| `/api/health` (public) | PASS | 200 `status: ok` |
| `/api/ready` | PASS | 200 `ready: true`, DB + Redis reachable, mock provider, no secrets in body |
| `/api/meta/health`, `/api/meta/accounts` | PASS | Mock mode, `ads_read`, 2 accounts discovered |
| Queued `POST /api/meta/sync` → run record with checkpoint/progress/duration | PASS | Run `1229f187…` finalized with 1/1 chunks, 0 failed |
| Dashboard on persisted data | PASS | 91KB render, `Persisted data` badge, account name, no `Demo data` marker |

### AI (live, mock-grounded)

| Check | Result | Evidence |
|-------|--------|----------|
| Grounded answer on real persisted rows | PASS | "Spend is BDT 30,304.14 (available)… ROAS 11.83" — DB cross-check `sum(spend)` = **30304.14 exactly** |
| Conversation persistence + reload + continuation | PASS | 1 conversation, 4 messages (user/assistant ×2) via `/api/ai/conversations` |
| Usage nulls (no provider key configured) | PASS | `usage_json` all `null`, `provider: mock-grounded` |

### Email (live, mock provider — no real delivery)

| Check | Result | Evidence |
|-------|--------|----------|
| Report + recipient CRUD via API | PASS | Report `6058df3a…` created (201) |
| Scheduler claim → render → send → log → advance | PASS | Tick: `due: 1, sent: 1`; log row `sent\|mock\|1 recipient\|attempt 1`; report `last_status: sent`, next run in future |
| Duplicate protection on re-tick | PASS | Second tick sent nothing new |

### Audit (live)

| Check | Result | Evidence |
|-------|--------|----------|
| `meta.sync.trigger/complete`, `ai.conversation.create` rows | PASS | Present with `userId: null` + actor preserved pattern verified by test; no secrets in rows |
| Login audit rows | NOT VERIFIED live | Login UI flow not driven headlessly here; writer unit-covered |

### Backup / restore drill (live, local — PASS)

| Check | Result | Evidence |
|-------|--------|----------|
| `pg_dump` backup created + readable | PASS | 1,081,662-byte dump |
| Restore into isolated `meta_restore` (never over production) | PASS | Restore clean; 3 migrations, 220 metrics, 10 runs, 5 audits, 1 delivery row present |
| App reconnects to restored DB | PASS | One-off web on scratch DSN: `/api/ready` 200 `database.reachable: true` |
| Scratch torn down | PASS | `meta_restore` dropped afterward |

### Security scan (2026-09-15, tracked files)

| Check | Result | Evidence |
|-------|--------|----------|
| Token/key/private-key patterns; hardcoded test account; Meta write methods | PASS | All `git grep` scans clean (re-run for M11) |

## Tally (M11 execution)

- PASS: 12 local/static + ~30 live local-stack checks above (build, migrate×3, seed, health×4, discovery, queued sync, run record, idempotency, DB row counts, dashboard, AI×4, email×6, audit×2, backup drill×5, queue metrics, secret scans)
- FAIL: 0 (4 live defects found; all fixed and re-verified same session)
- BLOCKED: Meta token-gated items only (smoke, real discovery/sync, real sends, Coolify/AOF/production backup)
- NOT VERIFIED: production Coolify values of everything above; login-UI-driven audit row

## Blockers (unchanged in kind)

- **EXTERNAL PROVIDER / CONFIGURATION**: Meta token issuance; Coolify env + resources.
- **CODE**: none remaining known.
