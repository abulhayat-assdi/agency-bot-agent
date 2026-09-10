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

Status: complete when commit `feat: add deterministic analytics engine` is pushed.

Deterministic metrics, validation, date/timezone handling, currency, comparison, sufficiency, and anomaly engines with unit tests.

Implemented scope:

- MetricValue state model preserving actual zero vs null/unavailable/unsupported/partial/API error
- Deterministic formulas for frequency, CTR, CPC, CPM, CPA, conversion rate, and ROAS
- Source/provider row normalization into analytics metric sets
- Aggregation helper with partial-state propagation
- Absolute and percentage-change comparison engine
- Trend calculation by reporting date
- Entity ranking with unavailable metric exclusion
- Configurable deterministic data sufficiency thresholds
- Threshold-based anomaly detection for CPA spike, CTR drop, CPM spike, ROAS decline, conversion drop, and spend changes
- Account-timezone date preset utilities and previous-period calculations
- Currency formatting and mixed-currency aggregation guard
- Unit tests for all critical formulas and analytics behaviors

Commit: `feat: add deterministic analytics engine`

## Milestone 6: Dashboard

Status: complete when commit `feat: implement real dashboard analytics` is pushed.

Overview, clients, accounts, KPI cards, charts, filters, and tables.

Implemented scope:

- Mock-backed dashboard data service using the read-only Meta provider and deterministic analytics engine
- Agency overview dashboard with date/client/account filters
- KPI cards for client/account counts, delivery metrics, CTR, conversions, CPC, and ROAS
- Currency-safe financial summaries grouped by currency
- Recharts performance trend chart
- Top campaign ranking table with unavailable ROAS exclusion
- Deterministic anomaly/alert panel
- Data freshness and caveat panels
- Clients list and client overview pages
- Ad accounts list and ad account overview pages
- Account metadata visibility for timezone, currency, account ID, sync freshness, and access status
- Dashboard documentation

Commit: `feat: implement real dashboard analytics`

## Milestone 7: Deep Reports

Status: complete when commit `feat: add campaign adset and ad reports` is pushed.

Campaign, ad set, and individual ad reporting.

Implemented scope:

- Campaign report route with KPI grid, child ad set table, period comparison, daily trend, anomalies, and report-local breakdown previews
- Ad set report route with KPI grid, child ad table, optimization/billing context, period comparison, daily trend, anomalies, and report-local breakdown previews
- Individual ad report route with creative metadata, attribution/reporting context, KPI grid, data sufficiency, period comparison, daily trend, breakdown previews, and disabled Analyze This Ad action pending AI milestone
- Breadcrumb navigation for Client → Account → Campaign → Ad Set → Ad
- Reusable report components for KPI grids, comparison, trend, child performance, breakdown previews, anomalies, data health, and AI action placeholder
- Mock-backed report data service with tests
- Deep report documentation

Commit: `feat: add campaign adset and ad reports`

## Milestone 8: Breakdowns

Status: complete when commit `feat: add meta breakdown analytics` is pushed.

Demographics, geography, platform, placement, device, hourly breakdowns, and compatibility engine.

Implemented scope:

- Metadata-driven breakdown capability registry
- Capability validation before provider requests
- Supported mock-backed dimensions for age, gender, age × gender, country, region, publisher platform, platform position, device platform, impression device, and advertiser-time hourly analysis
- Conditional/disabled state for audience-time hourly analysis and known-invalid combinations
- Breakdown data service that groups provider rows and runs deterministic analytics on each segment
- Breakdowns UI with account/date filters, capability matrix, disabled-combination explanations, charts, tables, availability summaries, timezone, currency, and caveats
- Tests for capability validation, grouped breakdown output, unsupported fallback behavior, and hourly unsupported reach handling
- Breakdown documentation

Commit: `feat: add meta breakdown analytics`

## Milestone 9: Trends and Comparison

Status: complete when commit `feat: add comparison and trend analytics` is pushed.

Period comparison, entity comparison, trend views, performance ranking.

Implemented scope:

- Mock-backed trend dashboard data service
- Current period vs previous equivalent period comparisons
- Campaign vs campaign, ad set vs ad set, and ad vs ad ranking views
- Metric selection for ROAS, CPA, CTR, CPC, conversions, and spend
- Account-level comparison table with absolute change, percentage change, and direction
- Top movers by absolute percentage movement
- Account-level daily trend chart for spend, clicks, conversions, and ROAS
- Deterministic anomaly panel
- Data sufficiency labels in ranking tables
- Tests for levels, ranking outputs, previous-period/date handling, and route-compatible report links
- Trends documentation

Commit: `feat: add comparison and trend analytics`

## Milestone 10: Redis and BullMQ Jobs

Status: complete when commit `feat: add redis bullmq sync jobs` is pushed.

Durable background job architecture for scheduled read-only Meta sync work.

Implemented scope:

- BullMQ and Redis dependencies
- Typed sync job payloads/results for manual, scheduled, incremental, and backfill work
- Queue factory and queue-events factory with fail-fast Redis configuration
- Bounded exponential retry policy and job retention settings
- Read-only sync worker that scans provider account hierarchy, creatives, insights, and optional breakdown rows
- All-account and single-account sync job processing
- Recurring sync registration script using `SYNC_INTERVAL_MINUTES`
- Worker process script with graceful shutdown and structured non-secret logs
- `/api/jobs/health` readiness endpoint
- `/sync` operations page documenting queue status, lifecycle, retry policy, and read-only guarantees
- Tests for worker scans, all-account aggregation, missing-account partial results, non-retryable provider errors, and Redis readiness redaction
- Job architecture documentation

Commit: `feat: add redis bullmq sync jobs`

## Milestone 11: OpenAI AI Analyst

Status: complete when commit `feat: add grounded openai ai analyst` is pushed.

Grounded AI tool layer, chat, individual ad analysis, anomaly explanation.

Implemented scope:

- Intent classification for summaries, top performers, bottom performers, anomalies, selected-ad analysis, and data availability
- Controlled read-only tool evidence layer backed by dashboard, trend, and report services
- OpenAI chat completion integration when `OPENAI_API_KEY` is configured
- Deterministic grounded fallback when OpenAI is not configured or unavailable
- Strict system prompt forbidding invented metrics, actual profit claims, write actions, and null-to-zero transformations
- `/ai-analyst` UI with account/date/question controls, suggested prompts, grounded response output, and visible evidence cards
- `/api/ai/analyst` protected POST route
- `Analyze This Ad` links from individual ad reports into constrained ad-level AI analysis
- Tests for intent routing, grounded evidence, unavailable ad behavior, deterministic fallback, and secret redaction expectations
- AI architecture documentation updated to match implementation

Commit: `feat: add grounded openai ai analyst`

## Milestone 12: Email Reporting

Status: complete when commit `feat: add scheduled email reporting` is pushed.

Report schedules, recipients, templates, delivery logs, configuration UI.

Implemented scope:

- Typed email report configuration, recipient, schedule, rendered content, provider, and delivery log models
- Mock and Resend-compatible email provider abstraction
- Provider readiness without exposing credentials
- Mock-backed report schedules for account summary, performance alerts, and selected-ad watchlist examples
- Deterministic email template rendering with account scope, date range, timezone, KPI states, anomalies, optional grounded AI summary, dashboard links, and caveats
- Delivery send service with enabled/disabled handling, active-recipient filtering, safe provider failures, and delivery log output
- `/email-reports` UI for schedule configuration model, recipients, rendered previews, delivery history, provider state, and caveats
- `POST /api/email-reports/send` protected send endpoint
- Tests for rendering, provider abstraction, disabled-report skipping, safe failures, and provider readiness redaction
- Email reporting documentation updated

Commit: `feat: add scheduled email reporting`

## Milestone 13: Real Meta Integration

Read-only Graph API provider, ingestion, sync engine, live breakdowns, error/retry handling.

Commit: `feat: add read only meta ads integration`

## Milestone 14: Testing + Hardening

Unit, integration, E2E, security, performance, error states, data integrity.

Commit: `test: harden reporting platform`

## Milestone 15: Production Deployment Readiness

Docker, health checks, migration/worker architecture, Coolify docs.

Commit: `chore: prepare coolify production deployment`
