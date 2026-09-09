# Milestone Plan

## Milestone 0: Repository + environment inspection

Status: complete when committed and pushed.

Findings:

- Repository remote: `https://github.com/abulhayat-assdi/agency-bot-agent.git`
- Default branch: `main`
- Arena working branch: `arena/01a08791-agency-bot-agent`
- Initial repository contents: `README.md` only
- Package manager/build tools: none present at baseline
- No production secrets found

Deliverables:

- Baseline README
- `.gitignore`
- `.env.example`
- Architecture and planning documentation
- Current Meta API research notes

Validation:

- Lint/typecheck/tests are not available yet because no application/package manager exists. These will be added in Milestone 1.

## Milestone 1: Project foundation

Status: complete when commit `feat: initialize application architecture` is pushed.

Initialize Next.js, TypeScript, Tailwind CSS, shadcn/ui-style component foundation, layout, navigation, configuration, and basic error handling.

Implemented scope:

- npm-based Next.js application scaffold
- TypeScript strict configuration
- Tailwind CSS theme and global styles
- shadcn/ui-style primitives and `components.json`
- Dashboard app shell and navigation route placeholders
- Loading, not-found, and dashboard error states
- Environment configuration validation
- Structured logger foundation
- Health API route
- Vitest foundation test for environment configuration

Commit: `feat: initialize application architecture`

## Milestone 2: Authentication

Status: complete when commit `feat: add admin authentication` is pushed.

Admin login, password hashing, sessions, cookies, route protection, login rate limiting.

Implemented scope:

- `/login` admin login route and accessible form
- Server action credential validation
- Bcrypt password hash verification support
- Signed JWT session creation and verification with `jose`
- HTTP-only, SameSite session cookie with production `secure` behavior
- Next.js proxy route protection for dashboard and API routes
- Logout server action
- Best-effort in-memory login rate limiting
- Auth documentation
- Unit tests for credential validation and session verification

Commit: `feat: add admin authentication`

## Milestone 3: PostgreSQL

Status: complete when commit `feat: add database schema and data layer` is pushed.

Schema, migrations, indexes, repositories, seed/mock setup.

Implemented scope:

- Drizzle ORM and Drizzle Kit configuration
- PostgreSQL schema for tenancy, auth persistence, Meta hierarchy, ingestion, metrics, breakdowns, data availability, sync runs/errors, anomalies, AI, email reporting, audit logs, and system settings
- Initial generated SQL migration
- Database client factory with safe lazy connection
- Repository foundations for agencies, clients, ad accounts, and metrics
- Mock seed script for agency/client/ad-account metadata
- Password hash helper script for admin bootstrap setup
- Database documentation synchronized with implementation

Commit: `feat: add database schema and data layer`


## Foundation audit after Milestone 3

Status: complete when commit `chore: audit and harden existing foundation` is pushed.

Audit/fix scope:

- Keep one coherent signed-cookie session architecture and remove the unused sessions table
- Add forward migration for session-table removal and metric counter type hardening
- Move login rate limiting behind an interface with in-memory fallback and documented Redis future
- Convert large metric counters to PostgreSQL `bigint`
- Document audit decisions and limitations

Commit: `chore: audit and harden existing foundation`

## Milestone 4: Mock Meta API

Status: complete when commit `feat: add realistic mock meta adapter` is pushed.

Mock provider supporting hierarchy, metrics, breakdowns, pagination, missing fields, unsupported breakdowns, API errors, and rate limiting simulation.

Implemented scope:

- Read-only `MetaAdsProvider` interface
- Typed Meta account/campaign/ad-set/ad/creative/insight models
- Deterministic mock account hierarchy
- Deterministic daily ad metrics with parent aggregation
- Pagination helper with opaque cursors
- Breakdown capability metadata and mock breakdown transforms
- Missing/unavailable/unsupported metric states
- Typed mock Meta API errors for unsupported breakdowns and rate limits
- Unit tests for hierarchy, pagination, metric consistency, breakdown limitations, and error simulation
- Mock adapter documentation

Commit: `feat: add realistic mock meta adapter`

## Milestone 5: Analytics Engine

Deterministic metrics, validation, date/timezone handling, currency, comparison, sufficiency, and anomaly engines with unit tests.

Commit: `feat: add analytics engine`

## Milestone 6: Dashboard

Overview, clients, accounts, KPI cards, charts, filters, and tables.

Commit: `feat: add analytics dashboard`

## Milestone 7: Deep Reports

Campaign, ad set, and individual ad reporting.

Commit: `feat: add campaign adset and ad reports`

## Milestone 8: Breakdowns

Demographics, geography, platform, placement, device, hourly breakdowns, and compatibility engine.

Commit: `feat: add meta breakdown analytics`

## Milestone 9: Trends and Comparison

Period comparison, entity comparison, trend views, performance ranking.

Commit: `feat: add comparison and trend analytics`

## Milestone 10: OpenAI AI Analyst

Grounded AI tool layer, chat, individual ad analysis, anomaly explanation.

Commit: `feat: add grounded openai ai analyst`

## Milestone 11: Email Reporting

Report schedules, recipients, templates, delivery logs, configuration UI.

Commit: `feat: add scheduled email reporting`

## Milestone 12: Real Meta Integration

Read-only Graph API provider, ingestion, sync engine, live breakdowns, error/retry handling.

Commit: `feat: add read only meta ads integration`

## Milestone 13: Testing + Hardening

Unit, integration, E2E, security, performance, error states, data integrity.

Commit: `test: harden reporting platform`

## Milestone 14: Production Deployment Readiness

Docker, health checks, migration/worker architecture, Coolify docs.

Commit: `chore: prepare coolify production deployment`
