# AI Meta Ads Intelligence Platform

Production-oriented, multi-client, read-only Meta Ads intelligence and analytics platform for a digital marketing agency.

## Current status

Milestone 0 establishes the repository baseline, current environment findings, verified Meta API assumptions, and the architecture plan. Implementation starts in controlled follow-up milestones.

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
- [Meta API assumptions](docs/META_API.md)
- [Database design](docs/DATABASE.md)
- [Analytics design](docs/ANALYTICS.md)
- [AI architecture](docs/AI.md)
- [Email reporting](docs/EMAIL.md)
- [Security](docs/SECURITY.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Milestone plan](docs/MILESTONES.md)

## Local environment

No package manager files existed at Milestone 0. Milestone 1 will initialize the application using the selected Next.js TypeScript stack and will add lint, typecheck, and test scripts.

## Security

Never commit real `.env` files or secrets. Use `.env.example` placeholders only.
