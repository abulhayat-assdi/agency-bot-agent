# Mock Meta Adapter

Milestone 4 implements a deterministic mock Meta Ads provider for development and tests without real Meta credentials.

## Goals

- Exercise the same application paths planned for the live read-only Meta Graph API provider.
- Provide realistic hierarchy and metric behavior without inventing production account facts.
- Simulate missing metrics, unavailable data, unsupported breakdown combinations, pagination, and rate limits.

## Provider interface

Source:

- `src/server/meta/types.ts`
- `src/server/meta/adapters/mock/mock-meta-provider.ts`

The `MetaAdsProvider` interface supports:

- `listAdAccounts`
- `listCampaigns`
- `listAdSets`
- `listAds`
- `getCreative`
- `getInsights`
- `getBreakdowns`

All methods are read-only. There are no mutation methods for campaigns, ad sets, ads, budgets, targeting, or creatives.

## Mock hierarchy

The mock dataset contains:

- 2 ad accounts with different currencies/timezones
- 3 campaigns per account
- 2 ad sets per campaign
- 2 ads per ad set
- creative metadata for every ad

Account examples:

- `act_100000000000001`, BDT, `Asia/Dhaka`
- `act_200000000000002`, USD, `America/New_York`

## Metric assumptions

Metrics are deterministic by ad ID and reporting date. They are not random at request time.

Consistency rules:

- clicks never exceed impressions
- conversions never exceed clicks
- child ad rows aggregate to campaign/ad-set/account rows for spend and delivery metrics
- spend is derived from impressions and CPM-like account/campaign factors
- conversion value is derived from conversions and account currency assumptions
- ROAS is not produced by the provider; analytics engine will derive it deterministically later

Unavailable/missing examples:

- `outboundClicks` is `null_from_source` on deterministic dates
- `conversionValue` is `unsupported` for awareness campaigns
- `conversionValue` is occasionally `unavailable` to exercise null handling
- hourly breakdown rows mark `reach` as `unsupported`
- region breakdown suppresses conversion value to simulate off-Meta action limitations

## Breakdown support

Supported combinations in the mock adapter:

- `age`
- `gender`
- `age,gender`
- `country`
- `region`
- `publisher_platform`
- `publisher_platform,platform_position`
- `publisher_platform,platform_position,impression_device`
- `device_platform`
- `hourly_stats_aggregated_by_advertiser_time_zone`

Simulated unsupported/conditional behavior:

- `hourly_stats_aggregated_by_audience_time_zone` is marked unsupported to simulate an account feature that is not enabled.
- arbitrary unsupported combinations, such as `age,publisher_platform`, throw a typed `MetaApiError` with kind `unsupported_breakdown`.

## Error and rate-limit simulation

`MockMetaAdsProvider` supports options:

```ts
createMockMetaAdsProvider({ simulateRateLimitAfter: 10 });
createMockMetaAdsProvider({ forceError: "permission" });
createMockMetaAdsProvider({ forceError: "transient" });
createMockMetaAdsProvider({ forceError: "invalid_request" });
```

Errors use the shared `MetaApiError` class with safe kind/code/retryability metadata.

## Pagination

All list and reporting methods support cursor-style pagination through `{ limit, after }`. Cursors are opaque base64url offsets in mock mode and should be treated as provider-owned cursors by callers.
