# Authentication

Milestone 2 implements the Phase 1 admin authentication foundation.

## Current scope

- Admin-only login at `/login`.
- Protected dashboard routes and non-health API routes through Next.js proxy middleware.
- Signed short-lived session token stored in an HTTP-only cookie.
- Secure cookie flag enabled automatically in production.
- Bootstrap admin credential validation from environment variables.
- Bcrypt password hash support for production bootstrap credentials.
- Best-effort in-memory login rate limiting until Redis-backed rate limiting is introduced.
- Server-side logout action that expires the session cookie.

## Environment variables

Required for a usable login:

```env
SESSION_SECRET=replace-with-a-long-random-secret
ADMIN_BOOTSTRAP_EMAIL=admin@example.com
ADMIN_BOOTSTRAP_PASSWORD_HASH=replace-with-bcrypt-password-hash
```

For local-only development, `ADMIN_BOOTSTRAP_PASSWORD` is also supported. Production should prefer `ADMIN_BOOTSTRAP_PASSWORD_HASH` and a strong `SESSION_SECRET` of at least 32 characters.

## Session model

The current production architecture uses signed, short-lived, HTTP-only cookie sessions. The session payload contains only minimal identity claims:

- admin user id
- email
- role
- agency id
- issued-at timestamp
- expiration timestamp

The token is not used to grant Meta permissions and does not contain provider credentials. The previously planned unused `sessions` table was removed during the foundation audit to avoid duplicate session architectures. A future DB-backed session architecture may be introduced deliberately when admin users are fully database-managed and route protection can perform durable session lookups safely.

## Route protection

Protected:

- `/`
- `/dashboard`
- `/clients`
- `/ad-accounts`
- `/breakdowns`
- `/trends`
- `/ai-analyst`
- `/reports`
- `/email-reports`
- `/settings`
- all `/api/*` routes except `/api/health`

Public:

- `/login`
- `/api/health`
- Next.js static/image assets

## Limitations before Milestone 3

- Sessions are signed and expiring but not persisted in PostgreSQL yet.
- Login rate limiting uses a `LoginRateLimiter` interface with an in-memory fallback implementation. It is per-process until the Redis-backed implementation is added in the Redis/BullMQ milestone.
- Audit logs are emitted as structured application logs now; durable audit log persistence comes with the database milestone.
