# Breakdown Analytics Engine

Milestone 8 implements a metadata-driven breakdown capability layer and a real mock-backed breakdown analytics page.

## Implemented route

- `/breakdowns`

The page supports account and date-range filters and lets admins select only supported breakdown combinations.

## Architecture

```text
Capability metadata
→ request validation
→ read-only Meta provider query
→ grouped breakdown rows
→ deterministic analytics engine
→ breakdown UI tables/charts
```

Core files:

```text
src/server/breakdowns/capabilities.ts
src/server/breakdowns/service.ts
src/server/breakdowns/index.ts
src/components/breakdowns/breakdown-bar-chart.tsx
src/components/breakdowns/capability-grid.tsx
src/app/(dashboard)/breakdowns/page.tsx
```

## Capability metadata

Every capability records:

- key
- label
- category
- dimensions
- supported/conditional state
- supported levels
- compatible dimension sets
- incompatible fields
- metric limitations
- required feature where applicable
- user-facing notes

## Supported mock-backed dimensions

- Age
- Gender
- Age × Gender
- Country
- Region
- Publisher Platform
- Publisher Platform × Position
- Device Platform
- Publisher Platform × Position × Impression Device
- Hourly by Advertiser Timezone

## Conditional/disabled dimensions

- Hourly by Audience Timezone is disabled in mock mode to simulate account-feature conditional availability.
- Known-invalid example `age,publisher_platform` is shown as disabled and is not sent from the UI.

## Important Meta limitations represented

- Breakdown metrics may be estimated.
- Certain fields are incompatible with breakdown requests, including old/unavailable fields such as `app_store_clicks`, `newsfeed_avg_position`, `newsfeed_clicks`, `relevance_score`, and `newsfeed_impressions`.
- Hourly breakdowns do not support reach/frequency or unique/video fields. The UI surfaces reach as unavailable/unsupported rather than showing misleading zeros.
- Region breakdown may not support some off-Meta action/value metrics.
- Impression-device and audience-time hourly breakdowns may require feature settings or async jobs on live accounts.

## Accuracy rules

- Unsupported combinations are rejected before provider queries.
- Unavailable values remain unavailable and are not treated as zero.
- Timezone is displayed and taken from the selected ad account.
- Currency is displayed and taken from the selected ad account.
- Categories are rendered dynamically from source rows; the UI does not hard-code platform/placement output categories as truth.

## Tests

Unit/integration-style coverage includes:

- capability validation for supported combinations
- rejection of unknown/conditional combinations
- hourly metric limitation metadata
- grouped breakdown data service output
- safe fallback for unsupported requested breakdowns
- hourly reach unsupported state propagation
