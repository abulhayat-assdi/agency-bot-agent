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

Schema, migrations, indexes, repositories, seed/mock setup.

Commit: `feat: add database schema and data layer`

## Milestone 4: Mock Meta API

Mock provider supporting hierarchy, metrics, breakdowns, pagination, missing fields, unsupported breakdowns, API errors, and rate limiting simulation.

Commit: `feat: add mock meta data adapter`

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
