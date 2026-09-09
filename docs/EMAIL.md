# Email Reporting

## Provider abstraction

Email delivery is behind an `EmailProvider` interface:

```ts
interface EmailProvider {
  send(input: EmailSendInput): Promise<EmailSendResult>;
}
```

The first production provider will be Resend. A local/mock provider will be used for tests.

## Report types

- Account summary
- Campaign report
- Ad set report
- Individual ad report
- AI summary
- Performance alerts
- Custom saved report where practical

## Configuration model

Admins can configure:

- enabled/disabled state
- report type
- client
- ad account
- optional campaign/ad set/ad scope
- recipients
- daily/weekly schedule
- delivery time in account timezone
- delivery history and failures

## Email content

Each report includes:

- selected date range and timezone
- KPIs with availability states
- trends and comparisons
- deterministic anomalies/alerts
- AI summary where enabled and grounded by report data
- dashboard link

## Failure handling

Provider failures are logged to `email_delivery_logs` with safe error messages. Invalid recipients are handled at validation and provider-response stages.
