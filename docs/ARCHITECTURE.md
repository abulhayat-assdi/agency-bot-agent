# Architecture

## Goals

Build a production-quality, multi-client, read-only Meta Ads intelligence platform where data accuracy and provenance are more important than feature breadth.

The core pipeline is:

```text
Meta Marketing API or mock provider
→ raw ingestion records
→ validation and normalization
→ PostgreSQL analytics tables
→ deterministic analytics engine
→ dashboard/report APIs
→ AI analyst interpretation over verified analytics only
```

## Non-goals for Phase 1

- No campaign/ad/ad set creation.
- No budget, bid, targeting, creative, status, or placement writes.
- No Meta write endpoints exposed to UI, backend API, background jobs, or AI tools.
- No actual profit reporting; use conversion value/revenue and ROAS only.

## Proposed application structure

```text
src/
  app/                         # Next.js App Router pages and API routes
    (auth)/login/
    (dashboard)/dashboard/
    (dashboard)/clients/
    (dashboard)/clients/[clientId]/
    (dashboard)/ad-accounts/[accountId]/
    (dashboard)/campaigns/[campaignId]/
    (dashboard)/adsets/[adsetId]/
    (dashboard)/ads/[adId]/
    (dashboard)/breakdowns/
    (dashboard)/trends/
    (dashboard)/ai-analyst/
    (dashboard)/reports/
    (dashboard)/email-reports/
    (dashboard)/settings/
    api/
      auth/
      clients/
      ad-accounts/
      reports/
      analytics/
      breakdowns/
      ai/
      email-reports/
      sync/
      health/
  components/
    ui/                         # shadcn/ui components
    charts/
    tables/
    layout/
    forms/
    states/                     # loading, empty, error, unavailable states
  server/
    auth/
    config/
    db/
    repositories/
    meta/
      adapters/
        mock/
        graph-api/
      ingestion/
      normalization/
      breakdowns/
    analytics/
      metrics/
      comparisons/
      sufficiency/
      anomalies/
      formatting/
    ai/
      tools/
      prompts/
      guardrails/
    email/
      providers/
      templates/
    jobs/
      queues/
      processors/
    observability/
    security/
  lib/
    dates/
    currency/
    validation/
    csv/
  tests/
    unit/
    integration/
    e2e/
prisma/ or migrations/          # migration system selected in Milestone 3
worker/                         # BullMQ worker entrypoint if separated from web
```

## Architecture decisions

1. **Next.js server/API first**: Use route handlers and server actions for the backend unless a separate service becomes necessary. Background workers are separate Node entrypoints for BullMQ.
2. **Repository pattern**: Keep database reads/writes in repositories. UI and API handlers cannot embed analytics or SQL business logic directly.
3. **Provider abstraction**: `MetaAdsProvider` interface supports `mock` and `graph-api` providers. OAuth-ready account linkage metadata is included even though Phase 1 uses manual partner access/system-user style access.
4. **Read-only enforcement**: Type-level interfaces, route naming, and allowlisted Graph endpoints prohibit Meta mutations. Any future write interface must be a separate explicit project phase.
5. **Deterministic metrics**: Derived metrics are calculated in `server/analytics`, not by AI prompts and not by UI components.
6. **Provenance-first storage**: Every metric row includes account, level, date range, timezone/currency context, attribution context, breakdown context, sync run, and availability state.
7. **AI as interpreter**: OpenAI receives verified tool results plus caveats; it cannot calculate primary metrics or query arbitrary raw JSON.

## Dashboard route map

- `/dashboard`: agency overview, KPIs, trends, anomalies, AI highlights, data freshness.
- `/clients`: searchable client index.
- `/clients/[clientId]`: consolidated client view, account comparison, top/weak campaigns.
- `/ad-accounts`: account registry and sync health.
- `/ad-accounts/[accountId]`: account overview with timezone, currency, reports, sync status.
- `/ad-accounts/[accountId]/campaigns`: campaign reporting.
- `/campaigns/[campaignId]`: campaign detail and child ad sets.
- `/adsets/[adsetId]`: ad set report including supported breakdowns.
- `/ads/[adId]`: individual ad deep dive and Analyze This Ad action.
- `/breakdowns`: audience/platform/device/time/geography analytics.
- `/trends`: period and entity comparison.
- `/ai-analyst`: grounded chat.
- `/reports`: saved/generated reports.
- `/email-reports`: scheduling, recipients, delivery history.
- `/settings`: agency settings, connected accounts, thresholds, security settings.

## API architecture

Route handlers are thin controllers:

```text
request validation → authz → repository/query service → analytics engine → response DTO
```

Planned API groups:

- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/session`
- `GET/POST/PATCH /api/clients` and `/api/clients/[id]`
- `GET/POST/PATCH /api/ad-accounts`
- `POST /api/sync/ad-accounts/[id]` manual sync trigger
- `GET /api/analytics/summary`
- `GET /api/analytics/entities`
- `GET /api/breakdowns/capabilities`
- `GET /api/breakdowns/query`
- `GET /api/trends`
- `GET /api/compare`
- `POST /api/ai/chat`
- `POST /api/ai/analyze-ad`
- `GET/POST/PATCH /api/email-reports`
- `GET /api/email-reports/[id]/deliveries`
- `GET /api/health`

## Background jobs

BullMQ queues:

- `meta-sync`: scheduled hourly sync, manual sync, backfill, retry orchestration.
- `meta-async-report`: Meta async report polling and result retrieval.
- `ai-insights`: scheduled deterministic insight generation and AI summaries.
- `email-report`: scheduled email compilation and delivery.
- `maintenance`: cleanup, retention, health checks.

## Observability

Use structured JSON logs with request IDs, sync run IDs, account IDs, provider, operation, and safe error classifications. Never log tokens, secrets, passwords, or raw request headers containing credentials.

## Blocking questions

None for Milestone 0. Future real Meta integration will need agency-owned Meta app details and read-only account access configured outside the repository, but no secrets are needed to design or build the mock-backed platform.
