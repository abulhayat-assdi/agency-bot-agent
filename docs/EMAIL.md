# Email Reporting

Milestone 12 implements mock-backed scheduled email reporting with provider abstraction, rendered templates, delivery logs, and a dashboard UI. The implementation is safe for Phase 1 because it reads existing deterministic analytics only and does not add any Meta write behavior.

## Provider abstraction

Email delivery is behind an `EmailProvider` interface:

```ts
interface EmailProvider {
  send(input: EmailSendInput): Promise<EmailSendResult>;
}
```

Implemented providers:

- `MockEmailProvider`: default local/test provider; accepts messages without external delivery.
- `ResendEmailProvider`: sends via Resend when `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, and `EMAIL_FROM` are configured outside Git.

Provider readiness is exposed without secrets. Logs include recipient counts, provider message IDs, and safe errors only.

## Report types

The configuration model supports:

- Account summary
- Campaign report
- Ad set report
- Individual ad report
- AI summary
- Performance alerts

The current mock dashboard includes account summary, performance alert, and selected-ad schedule examples. Campaign/ad-set durable configuration is reserved for database-backed editing.

## Configuration model

Each report stores or models:

- enabled/disabled state
- report type
- client
- ad account
- optional campaign/ad set/ad scope
- recipients with active/invited/disabled status
- daily/weekly/monthly schedule
- delivery time in report/account timezone
- selected deterministic date preset
- grounded AI summary toggle
- dashboard/report link
- delivery history and safe failures

## Email content

Each rendered report includes:

- selected date range and timezone
- account/client scope
- KPIs with availability states
- deterministic anomalies/alerts
- optional grounded AI summary
- dashboard link
- accuracy caveats

Email templates preserve unavailable/null/unsupported/partial states and never convert unavailable values into zero. Phase 1 does not report actual profit; reports use spend, conversion value, CPA, ROAS, CTR, CPC, conversions, and related deterministic analytics.

## User/API surfaces

- `/email-reports` shows configured schedules, recipients, rendered previews, and delivery history.
- `POST /api/email-reports/send` accepts `{ "reportId": "..." }` and sends through the configured provider abstraction.

The route is protected by the existing authenticated API route protection.

## Failure handling

Provider failures become `failed` delivery log records with safe error messages. Disabled reports are marked `skipped` without calling the provider. Invalid recipient/configuration data is rejected during render/send validation.

## Persistence (Milestone 9)

Email reporting is persisted in PostgreSQL: `email_reports` (with `next_run_at`, `last_run_at`, `last_status`), `email_recipients` (unique per report+email), and `email_delivery_logs` (provider, attempt number, safe errors). The scheduler claims due reports atomically, sends with bounded retries, records every attempt, and advances the next run. The `/email-reports` page manages persisted reports (create/enable/send/remove/recipients) when `DATABASE_URL` is configured and falls back to demo fixtures otherwise. Full CRUD is available at `/api/email-reports`, `/api/email-reports/[id]`, and the recipients sub-routes.
