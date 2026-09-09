# Deployment Plan

Target model:

```text
GitHub → Docker image/build → Coolify → Hostinger VPS (Ubuntu 24 LTS)
```

No production access is required or attempted during development.

## Services

- Web: Next.js application serving UI and API routes.
- Worker: Node/BullMQ worker for sync, AI insight, and email queues.
- PostgreSQL: managed by Coolify or external database.
- Redis: managed by Coolify or external Redis.

## Required environment variables

See `.env.example`.

Important categories:

- application URL and environment
- session secret
- PostgreSQL `DATABASE_URL`
- Redis `REDIS_URL`
- Meta app/version/token configuration
- OpenAI API key/model
- email provider and sender

## Docker requirements for later milestones

- Multi-stage Dockerfile.
- Production `next build`.
- Non-root runtime user where practical.
- Health check endpoint `/api/health`.
- Separate worker command/service.
- Migration command documented and runnable before web startup.

## Coolify notes

- Configure one web service and one worker service from the same repository/image.
- Attach PostgreSQL and Redis resources.
- Set production secrets in Coolify environment variables, not Git.
- Configure domain and SSL through Coolify.
- Ensure backups for PostgreSQL before production use.

## Health checks

The app should expose:

- application liveness
- database connectivity
- Redis connectivity
- migration/version status where feasible

Sensitive dependency details must not leak in public health responses.
