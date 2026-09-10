# Production Deployment Readiness

Target model:

```text
GitHub → Docker image/build → Coolify → Hostinger VPS or equivalent Docker host
```

No production access is required or attempted during development. All secrets must be configured in the deployment platform, never committed to Git.

## Services

The repository is prepared for three operational service types from the same image/source:

| Service | Command | Purpose |
| --- | --- | --- |
| Web | `npm run start:web` | Next.js UI and API routes on port `3000` |
| Worker | `npm run start:worker` | BullMQ read-only sync worker |
| Migration job | `npm run deploy:migrate` | Runs Drizzle migrations before/around deploy |

Required backing services:

- PostgreSQL
- Redis

## Docker files

- `Dockerfile` — multi-stage Node 22 image with dependency, build, production dependency, and runtime stages.
- `.dockerignore` — excludes Git, local env files, dependencies, caches, and build artifacts.
- `docker-compose.yml` — local smoke/deployment topology for web, worker, PostgreSQL, Redis, and migration profile.

The runtime image:

- binds to `0.0.0.0:3000`
- sets `NEXT_TELEMETRY_DISABLED=1`
- runs as non-root user `nextjs`
- exposes `/api/health` through a Docker healthcheck
- includes source/scripts needed by the TypeScript BullMQ worker

## Local Docker smoke test

Use placeholder-only local values and replace them in real deployment environments:

```bash
docker compose build
docker compose up -d postgres redis
docker compose --profile tools run --rm migrate
docker compose up -d web worker
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
3. Migration job
   - Run `npm run deploy:migrate` before deploying the web/worker services, using a build image that includes dev dependencies or Coolify's build environment.
4. PostgreSQL resource
   - Attach `DATABASE_URL` to web, worker, and migration job.
   - Configure backups before production use.
5. Redis resource
   - Attach `REDIS_URL` to worker and web.

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
| `/api/meta/health` | Yes | Meta provider mode/version/read-only readiness |
| `/api/jobs/health` | Yes | Redis/BullMQ readiness |

## Operational notes

- The web and worker services must share the same environment values.
- Run migrations before routing traffic to a new schema-dependent release.
- The current app remains mostly mock-backed until persisted live ingestion replaces mock dashboard/report services.
- The live Graph provider and BullMQ worker are ready for read-only provider calls when environment credentials are configured.
- API rate limiting is currently in-memory. Use one web replica or replace with Redis-backed rate limiting before horizontal scaling.
- Production CSP/frame policy should be finalized after the real domain and embedding requirements are known.

## Rollback

Use Coolify's previous deployment/image rollback feature. If a schema migration has already run, verify rollback compatibility before switching traffic back to an older image.
