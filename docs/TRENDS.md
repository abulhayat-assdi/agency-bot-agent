# Trends and Comparison Analytics

Milestone 9 implements mock-backed trend, comparison, and ranking analytics.

## Implemented route

- `/trends`

## Architecture

```text
Read-only mock Meta provider
→ current period rows
→ previous equivalent period rows
→ deterministic analytics engine
→ comparisons, rankings, movers, anomalies
→ trends UI
```

Core files:

```text
src/server/trends/service.ts
src/server/trends/service.test.ts
src/components/trends/account-trend-chart.tsx
src/components/trends/trend-controls.tsx
src/app/(dashboard)/trends/page.tsx
```

## Supported comparisons

The Trends page supports:

- current period vs previous equivalent period
- campaign vs campaign rankings
- ad set vs ad set rankings
- ad vs ad rankings
- account-level period comparison
- top movers by absolute percentage movement
- deterministic account-level anomaly checks

## Supported rank metrics

- Spend
- Impressions
- Clicks
- CTR
- CPC
- CPA
- Conversions
- Conversion Value
- ROAS

For CPC and CPA, lower is ranked as better. For other metrics, higher is ranked as better. Entities with unavailable selected metric values are excluded from rankings instead of being treated as zero.

## Date handling

Date presets are resolved in the selected ad account timezone. Previous equivalent period is calculated from account-local reporting dates.

Example for `Asia/Dhaka` on the fixed mock reference date:

```text
Current:  2026-09-04 – 2026-09-10
Previous: 2026-08-28 – 2026-09-03
```

## Accuracy rules

- Percentage change is unavailable when the comparison value is zero or unavailable.
- Rank tables exclude unavailable selected metric values.
- Data sufficiency labels are deterministic volume labels, not statistical significance.
- Anomalies are produced by deterministic threshold rules, not AI.
- No live Meta data is shown until the read-only Meta integration milestone.

## UI

The page includes:

- account filter
- date range filter
- entity comparison level selector
- metric ranking selector
- account-level KPI summary
- account-level daily trend line chart
- top movement drivers
- top/bottom entity tables
- period-over-period comparison table
- anomaly panel
- caveat panel
