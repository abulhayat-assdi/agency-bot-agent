# AI Meta Ads Intelligence Platform

Production-oriented, multi-client, read-only Meta Ads intelligence and analytics platform for a digital marketing agency.

## Current status

Milestone 0 established the repository baseline, current environment findings, verified Meta API assumptions, and the architecture plan. Milestone 1 initializes the Next.js/TypeScript/Tailwind application foundation. Milestone 2 adds admin authentication, signed session cookies, route protection, logout, and auth tests. Milestone 3 adds the PostgreSQL schema, Drizzle migrations, repository layer, and mock seed foundation. Milestone 4 adds a deterministic mock Meta adapter. Milestone 5 adds the deterministic analytics engine for metrics, comparisons, trends, rankings, sufficiency, anomalies, timezone date ranges, and currency safety. Milestone 6 adds mock-backed real dashboard analytics for overview, clients, and ad accounts. Milestone 7 adds campaign, ad set, and individual ad deep reports with drill-down navigation. Milestone 8 adds metadata-driven breakdown capability validation and mock-backed breakdown analytics UI. Milestone 9 adds trend, comparison, ranking, mover, and anomaly analytics UI. Milestone 10 adds Redis/BullMQ background sync job architecture and operations readiness. Milestone 11 adds a grounded OpenAI-compatible AI analyst with controlled read-only tool evidence. Milestone 12 adds mock-backed scheduled email reporting, templates, delivery provider abstraction, and delivery-history UI. Milestone 13 adds the read-only live Meta Graph API provider and sync-worker integration. Milestone 14 adds API/browser hardening, rate limiting, safer API errors, and additional integration tests.

## Repository

- Canonical repository: <https://github.com/abulhayat-assdi/agency-bot-agent.git>
- Default branch: `main`
- Arena working branch: `arena/01a08791-agency-bot-agent`

> Note: Arena Agent Mode requires this session's implementation work to remain on `arena/01a08791-agency-bot-agent`. Pull requests can be opened from this branch into `main` when appropriate.

## Planned stack

- Frontend and server: Next.js, TypeScript, Tailwind CSS, shadcn/ui, Recharts
- Database: PostgreSQL
- Jobs: Redis and BullMQ
- Meta integration: Meta Marketing API / Graph API, read-only in Phase 1
- AI: OpenAI API through controlled analytics tools only
- Email: Resend-compatible provider abstraction
- Deployment: Docker, GitHub, Coolify, Hostinger VPS

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Audit notes](docs/AUDIT.md)
- [Authentication](docs/AUTHENTICATION.md)
- [Meta API assumptions](docs/META_API.md)
- [Mock Meta adapter](docs/MOCK_META.md)
- [Database design](docs/DATABASE.md)
- [Analytics design](docs/ANALYTICS.md)
- [Dashboard analytics](docs/DASHBOARD.md)
- [Deep reports](docs/REPORTS.md)
- [Breakdown analytics](docs/BREAKDOWNS.md)
- [Trends and comparison](docs/TRENDS.md)
- [Redis and BullMQ jobs](docs/JOBS.md)
- [AI architecture](docs/AI.md)
- [Email reporting](docs/EMAIL.md)
- [Security](docs/SECURITY.md)
- [Testing and hardening](docs/TESTING_HARDENING.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Milestone plan](docs/MILESTONES.md)

## Local environment

Milestone 1 uses npm with Next.js, TypeScript, Tailwind CSS, shadcn/ui-style primitives, ESLint, Prettier, and Vitest. Use `npm run dev`, `npm run lint`, `npm run typecheck`, `npm run test`, and `npm run build` for local validation. Database commands are `npm run db:generate`, `npm run db:migrate`, `npm run db:studio`, and `npm run db:seed`. Job commands are `npm run jobs:schedule-sync` and `npm run jobs:worker`; they require `REDIS_URL`.

## Security

Never commit real `.env` files or secrets. Use `.env.example` placeholders only.
