# Testing and Hardening

Milestone 14 adds security and reliability hardening around the existing read-only analytics platform.

## Validation commands

Run before each milestone commit:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm audit --omit=dev
git diff --check
```

Secret scanning is performed with repository grep patterns that exclude dependency/build/generated cache directories and allow placeholder-only `.env.example` values.

## Added hardening

### Browser/API headers

The app now applies baseline security headers globally through Next.js config and directly on API JSON responses:

- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `X-DNS-Prefetch-Control: off`
- restrictive `Permissions-Policy`
- production-only `Strict-Transport-Security`

`X-Frame-Options` is intentionally not set because Arena/Coolify preview environments may embed the app in an iframe. Frame restrictions can be revisited during production deployment with the exact production host/origin.

### API rate limiting

Sensitive API routes now use in-memory rate limiting as a safe baseline:

- `POST /api/ai/analyst`: 30 requests/minute per client IP
- `POST /api/email-reports/send`: 10 requests/10 minutes per client IP

The limiter returns safe `Retry-After`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` headers. A Redis-backed distributed limiter should replace this in multi-instance production deployment.

### Safer API errors

AI and email API routes now return generic safe error messages instead of uncaught implementation/provider errors. Email report IDs are bounded and unknown report IDs return `404`.

### Read-only assurances

Live Meta integration remains GET-only. No Meta write endpoint, AI write tool, budget mutation, targeting mutation, pause/resume action, campaign mutation, ad-set mutation, ad mutation, or creative mutation has been added.

## Test coverage added

- Security header behavior, including production-only HSTS and preview-safe frame behavior.
- API rate limiter window/reset/header behavior.
- AI analyst API invalid payload, successful grounded response, and rate limiting.
- Email report send API invalid payload, missing report ID handling, and rate limiting.
- Meta provider factory readiness redaction and live-mode fail-fast token requirement.

## Remaining hardening for deployment milestone

- Add browser-level E2E tests once deployment/preview command topology is finalized.
- Replace process-local API rate limiting with Redis-backed distributed limiting for multi-replica production.
- Add production CSP after final asset/script/style requirements and embedding policy are known.
- Add database-backed audit records for AI/email/send operations.
- Add OpenTelemetry or provider-specific metrics export for sync/email/AI latency and failure rates.
