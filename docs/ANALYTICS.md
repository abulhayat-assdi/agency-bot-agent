# Analytics Architecture

## Principle

The analytics engine deterministically computes derived metrics from validated normalized data. AI and UI components consume these outputs and must not invent or independently recalculate primary facts.

## Source metric handling

Every metric value is represented as:

```ts
type MetricValue<T = number> = {
  value: T | null;
  state: 'available' | 'actual_zero' | 'null_from_source' | 'unavailable' | 'unsupported' | 'insufficient_data' | 'api_error' | 'partial';
  source?: 'meta' | 'derived';
  reason?: string;
};
```

Zero is only zero if Meta returns zero or a deterministic calculation yields zero from valid zero-valued inputs.

## Derived metric formulas

Calculate only when inputs are available and denominators are greater than zero unless the formula explicitly supports zero.

- `CTR = clicks / impressions * 100`
- `CPC = spend / clicks`
- `CPM = spend / impressions * 1000`
- `CPA = spend / conversions`
- `Conversion Rate = conversions / clicks * 100`
- `ROAS = conversion_value / spend`
- `Absolute Change = current - comparison`
- `Percentage Change = (current - comparison) / abs(comparison) * 100` when comparison is non-zero

If the denominator is zero or unavailable, return `null` with `insufficient_data` or `unavailable` as appropriate.

## Comparison engine

Supported comparisons:

- Current period vs previous equivalent period.
- Current period vs custom period.
- Campaign vs campaign.
- Ad set vs ad set.
- Ad vs ad.

Outputs:

- current value
- comparison value
- absolute change
- percentage change
- direction (`up`, `down`, `flat`, `not_comparable`)
- sufficiency state
- caveats

## Data sufficiency thresholds

Initial configurable defaults:

- `insufficient_data`: impressions < 500 or clicks < 20 for click/conversion metrics.
- `low_volume`: impressions 500-1,999 or clicks 20-49.
- `directional_only`: impressions 2,000-4,999 or clicks 50-99, or conversions 1-9.
- `reliable_enough_for_comparison`: impressions >= 5,000 and clicks >= 100 for click-rate metrics; conversions >= 10 for CPA/ROAS-oriented findings.

These are not statistical significance claims. UI and AI must describe them as deterministic sufficiency labels only.

## Anomaly detection

Initial deterministic rules, configurable per agency/account:

- CPA spike: CPA increases by >= 35% and absolute spend/conversions meet sufficiency thresholds.
- CTR drop: CTR decreases by >= 25% with sufficient impressions.
- CPM spike: CPM increases by >= 30% with sufficient impressions.
- ROAS decline: ROAS decreases by >= 30% with valid conversion value and spend.
- Conversion drop: conversions decrease by >= 30% with baseline conversions >= 10.
- Spend shift: spend changes by >= 40% and absolute change exceeds configurable currency amount.

The anomaly engine flags anomalies; AI can only explain flagged anomalies with evidence and caveats.

## Timezone and date handling

- Use ad account timezone for report date boundaries.
- Store timezone on every account and metric aggregation.
- Display selected actual dates and timezone on every report.
- Do not use server timezone for report calculations.

## Currency handling

- Store currency per ad account.
- Aggregate across accounts only when currency matches or when explicitly grouped by currency.
- Never silently convert currencies in Phase 1.
