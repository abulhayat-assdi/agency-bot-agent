# Deep Reports

Milestone 7 implements mock-backed campaign, ad set, and individual ad reporting surfaces.

## Implemented routes

- `/campaigns/[campaignId]`
- `/adsets/[adSetId]`
- `/ads/[adId]`

The drill-down path is now available:

```text
Client → Ad Account → Campaign → Ad Set → Ad
```

## Data source and accuracy

Reports are powered by `src/server/reports/mock-report-data.ts`, which uses:

```text
MockMetaAdsProvider → deterministic analytics engine → report view models
```

No live Meta facts are displayed yet. Reports preserve source availability states and never convert null/unavailable/unsupported values into zero.

## Campaign report

The campaign report includes:

- campaign name and ID
- status
- objective
- buying type
- account currency
- account timezone
- selected date range
- spend
- impressions
- reach
- frequency
- clicks
- CTR
- CPC
- CPM
- conversions
- CPA
- conversion rate
- conversion value
- ROAS
- child ad set performance
- period comparison
- daily trend
- deterministic anomalies
- preview breakdown sections
- data health and caveats

## Ad set report

The ad set report includes:

- ad set name and ID
- status
- parent campaign
- optimization goal
- billing event
- attribution/reporting caveat
- KPI grid
- child ads
- daily trend
- period comparison
- deterministic anomalies
- demographic/geographic/platform/device/hourly preview breakdowns
- data health

## Individual ad report

The ad report includes:

- ad name and ID
- status
- campaign
- ad set
- creative ID
- creative type
- optimization goal
- attribution/reporting context
- KPI grid
- conversion value
- outbound clicks
- data sufficiency label
- period comparison
- daily trend
- demographic/geographic/platform/device/hourly preview breakdowns
- data availability/caveats
- disabled `Analyze This Ad` action until the grounded AI milestone

The `Analyze This Ad` UI explicitly states that only the selected ad's verified analytics context may be sent to AI when AI is implemented.

## Breakdown note

Milestone 7 shows report-local preview breakdown tables using the mock provider. Milestone 8 will implement the reusable metadata-driven breakdown engine and full breakdown analytics UI.
