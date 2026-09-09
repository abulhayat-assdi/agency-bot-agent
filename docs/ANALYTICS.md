# Analytics Architecture

Milestone 5 implements the deterministic analytics engine in `src/server/analytics`.

## Principle

The analytics engine deterministically computes derived metrics from validated normalized data. AI and UI components consume these outputs and must not invent or independently recalculate primary facts.

## Implemented modules

```text
src/server/analytics/
  metrics/
    types.ts            # MetricValue, states, source/derived metric keys
    value.ts            # safe metric constructors and usability checks
    formulas.ts         # CTR, CPC, CPM, CPA, conversion rate, ROAS, frequency
    normalization.ts    # provider row → analytics metric set
    aggregate.ts        # period/entity aggregation with partial-state handling
  comparison/
    comparison.ts       # absolute and percentage change
  sufficiency/
    sufficiency.ts      # deterministic volume labels
  anomalies/
    anomalies.ts        # threshold-based anomaly detection
  trends/
    trends.ts           # ordered account-local trend calculations
  rankings/
    rankings.ts         # available-value-only ranking
  index.ts              # public exports
```

Supporting utility modules:

```text
src/lib/dates/reporting.ts       # account-timezone date presets and labels
src/lib/currency/format.ts       # currency formatting and mixed-currency guard
```

## Source metric handling

Every metric value is represented as:

```ts
type MetricValue<T = number> = {
  value: T | null;
  state:
    | "available"
    | "actual_zero"
    | "null_from_source"
    | "unavailable"
    | "unsupported"
    | "insufficient_data"
    | "api_error"
    | "partial";
  source: "meta" | "derived" | "aggregate";
  reason?: string;
};
```

Zero is only zero if Meta/mock data returns zero or a deterministic calculation yields zero from valid zero-valued inputs. Missing, unavailable, unsupported, partial, and API-error states remain explicit and are not converted to zero.

## Derived metric formulas

Calculate only when inputs are usable and denominators are greater than zero.

- `Frequency = impressions / reach`
- `CTR = clicks / impressions * 100`
- `CPC = spend / clicks`
- `CPM = spend / impressions * 1000`
- `CPA = spend / conversions`
- `Conversion Rate = conversions / clicks * 100`
- `ROAS = conversion_value / spend`
- `Absolute Change = current - comparison`
- `Percentage Change = (current - comparison) / abs(comparison) * 100` when comparison is non-zero

If the denominator is zero or unavailable, return `null` with `insufficient_data`, `unsupported`, `unavailable`, or the source state as appropriate.

## Comparison engine

Supported comparison primitive:

```ts
compareMetric(current, comparison)
```

Outputs:

- current value
- comparison value
- absolute change
- percentage change
- direction (`up`, `down`, `flat`, `not_comparable`)

Percentage change is not calculated when the comparison value is zero.

## Trend and ranking engine

Trends sort by the provided reporting date string, which is expected to already be in the ad account's reporting timezone.

Rankings include only entities with usable metric values. Unavailable/null/unsupported metrics are excluded instead of being treated as zero.

## Data sufficiency thresholds

Initial configurable defaults:

- `insufficient_data`: impressions < 500 or clicks < 20.
- `low_volume`: impressions 500-1,999 or clicks 20-49.
- `directional_only`: impressions 2,000-4,999 or clicks 50-99, or conversions 1-9.
- `reliable_enough_for_comparison`: impressions >= 5,000, clicks >= 100, and conversions >= 10 for conversion-sensitive findings.

These are deterministic volume labels only. They are not statistical significance claims.

## Anomaly detection

Initial deterministic rules, configurable per agency/account later:

- CPA spike: CPA increases by >= 35%.
- CTR drop: CTR decreases by >= 25%.
- CPM spike: CPM increases by >= 30%.
- ROAS decline: ROAS decreases by >= 30%.
- Conversion drop: conversions decrease by >= 30% with baseline conversions >= 10.
- Spend shift: spend changes by >= 40% and absolute change exceeds a configurable currency amount.

The anomaly engine flags anomalies. AI will only explain flagged anomalies with evidence and caveats.

## Timezone and date handling

- Use ad account timezone for report date boundaries.
- Date presets are resolved from an instant into an account-local `YYYY-MM-DD` range.
- Previous equivalent period calculations operate on account-local reporting dates.
- Do not use server timezone for report calculations.
- Hour labels are deterministic `00:00–00:59` through `23:00–23:59` labels.

## Currency handling

- Store and format currency per ad account.
- Aggregate across accounts only when currency matches or when explicitly grouped by currency.
- `assertSingleCurrency` rejects silent mixed-currency aggregation.
- No currency conversion is performed in Phase 1.

## Tests

Unit coverage includes:

- CTR
- CPC
- CPM
- CPA
- ROAS
- conversion rate
- frequency
- divide-by-zero handling
- unavailable/null state propagation
- actual-zero handling
- absolute and percentage changes
- zero-baseline percentage behavior
- trend ordering
- rankings excluding unavailable metrics
- data sufficiency labels
- anomaly detection
- account-timezone date preset handling
- mixed-currency aggregation rejection
