# Security Model

## Authentication

Phase 1 is admin-only.

- Passwords hashed with a modern password hashing algorithm such as Argon2id or bcrypt with strong parameters.
- Server-side sessions with hashed session tokens stored in PostgreSQL.
- Secure, HTTP-only, SameSite cookies.
- Login rate limiting by hashed email and IP.
- Route protection enforced server-side for pages and API routes.

## Authorization

- Every query is scoped by agency and user authorization.
- Future multi-user/client roles are anticipated in schema, but Phase 1 exposes admin-only access.
- Frontend checks are UX only, never the source of authorization.

## Secrets

- Secrets live only in environment variables.
- `.env` and `.env.*` are ignored except `.env.example`.
- Never log tokens, passwords, API keys, or raw auth headers.
- `.env.example` contains placeholders only.

## Meta read-only enforcement

- Meta integration exposes read methods only.
- The AI tool layer has only analytical read tools.
- No campaign/ad/ad set/budget/targeting/creative mutation endpoints are implemented in Phase 1.
- The Insights Feature Settings POST endpoint is not called automatically because it changes account feature configuration.

## Input validation

All API handlers validate input using schema validation before repository or provider calls. CSV export parameters, report scopes, date ranges, and entity IDs are allowlisted and authorization-scoped.

## Audit logging

Audit logs capture sensitive administrative actions such as login success/failure, account registration, manual sync trigger, email report changes, and settings changes. Logs store safe metadata only.
