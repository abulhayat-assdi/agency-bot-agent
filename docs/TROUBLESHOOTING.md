# Troubleshooting

## Meta API

- Rate limited: inspect safe logs for error code `4`, throttle headers, and account/app utilization. Retry with exponential backoff and lower query complexity.
- Data-per-call limit: inspect error code `100`, subcode `1487534`; split date ranges/entities or use async report jobs.
- Missing reach/frequency in old breakdown reports: Meta may omit reach-related metrics for breakdown queries older than 13 months or after reach throttle. Mark as unavailable.
- Hourly reach/frequency shows zero: hourly breakdowns do not support reach/frequency; treat as unsupported instead of actual zero.
- Conversion metrics missing: could be attribution or iOS aggregation limitation. Mark as unavailable with attribution caveat.

## Sync

- Check `sync_runs` status and `sync_errors` safe messages.
- Resume from checkpoints for paginated or async jobs.
- Manual sync should not erase previously successful data on partial failure.

## AI

- If AI cannot answer, verify the corresponding analytics tool returns data.
- AI should not answer account-specific questions without grounded tool output.
- Review persisted tool evidence in `ai_messages.grounded_context_json`.

## Email

- Check report enabled state, recipients, account timezone schedule, and `email_delivery_logs`.
- Provider errors should expose safe messages only.
