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

## Current limitation

Schedules and delivery logs are deterministic mock-backed data in this milestone. The database schema already includes `email_reports`, `email_recipients`, and `email_delivery_logs`; durable editing and persistence can be wired during later hardening/live deployment work.
