# Meta Marketing API Assumptions and Integration Plan

Research date: 2026-09-10. Official documentation was rechecked before adding the live read-only provider.

Primary official sources reviewed:

- Graph API overview: <https://developers.facebook.com/docs/graph-api/>
- Ad Account Insights reference: <https://developers.facebook.com/docs/marketing-api/reference/ad-account/insights/>
- Insights breakdowns: <https://developers.facebook.com/docs/marketing-api/insights/breakdowns/>
- Insights limits and best practices: <https://developers.facebook.com/docs/marketing-api/insights/best-practices/>
- Permissions reference: <https://developers.facebook.com/docs/permissions/>

## Verified assumptions

1. **Current Graph API version**: Meta documentation lists the latest Graph API version as `v26.0`.
2. **Insights reference versions**: The Ad Account Insights reference currently exposes version selectors through `v25.0` in the fetched page while examples and best-practice docs reference `v26.0`. Implementation will make `META_GRAPH_API_VERSION` configurable and default `.env.example` to `v26.0`; compatibility will be validated during live integration.
3. **Primary read permission**: `ads_read` allows access to Ads Insights API reporting for ad accounts owned by or granted to the caller. It is the preferred Phase 1 permission. The application will not request or depend on `ads_management` for MVP read-only reporting unless a specific endpoint later proves to require it.
4. **App Review and Business Verification**: Official permissions docs state App Review is required for data the app does not own/manage, and Business Verification is required for Advanced Access. Phase 1 manual partner access still must respect the agency's app/access tier and client-granted asset permissions.
5. **Insights endpoint levels**: Insights can be read at account, campaign, ad set, and ad levels using `/<AD_OBJECT>/insights` with `level=account|campaign|adset|ad` where applicable.
6. **Default Insights fields**: If `fields` is not provided, the endpoint defaults to impressions and spend. The platform will always request explicit allowlisted fields.
7. **Date handling**: `date_preset`, `time_range`, `time_ranges`, and `time_increment` are supported. `time_range` uses `YYYY-MM-DD` boundaries. Account timezone is the reporting basis for ad insights and must be stored/displayed.
8. **Attribution**: `action_attribution_windows`, `use_account_attribution_setting`, and `use_unified_attribution_setting` exist. Meta notes changes around unified attribution and Ads Manager-like behavior. The platform will store requested attribution context and returned context; reports will show attribution caveats.
9. **Pagination**: Insights responses include `paging` cursors. The sync engine must follow pagination and preserve request context/checkpoints.
10. **Rate limits and retries**: Meta uses Ads Insights throttle headers such as `x-fb-ads-insights-throttle` and ad account usage headers. Error code `4` and subcode `1504022` indicate too many requests/global load. The sync engine will pace requests, back off near limits, and retry transient failures.
11. **Timeout/data limits**: Large synchronous Insights queries may timeout or hit data-per-call limits such as error code `100`, subcode `1487534`. The platform will split date ranges/entities and use async report jobs for heavy requests.
12. **Async report jobs**: `POST <AD_OBJECT>/insights` can create an Ad Report Run, which is polled until completion. Report run IDs expire after 30 days and are not durable identifiers.
13. **Estimated/in-development metrics**: Meta identifies some Insights metrics, including breakdown values, as estimated or in development. UI and AI summaries must use directional language where appropriate.
14. **iOS/attribution caveats**: Meta documentation states some non-inline conversion metrics may not aggregate across iOS 14.5 and non-iOS 14.5 attribution logic. Treat missing conversion metrics as unavailable/null, not zero.

## Read-only endpoint allowlist for Phase 1

The live provider may call only `GET` endpoints and Meta async report creation/polling where needed for reporting. No POST endpoint is allowed except Insights async report job creation because it creates a report run, not an ad object or campaign mutation. The Insights Feature Settings API includes a POST to enable features; Phase 1 will **not** call that endpoint automatically because it changes account feature configuration.

Planned reads:

- `GET /act_<AD_ACCOUNT_ID>` for account metadata such as name, currency, timezone.
- `GET /act_<AD_ACCOUNT_ID>/campaigns`
- `GET /act_<AD_ACCOUNT_ID>/adsets`
- `GET /act_<AD_ACCOUNT_ID>/ads`
- `GET /<AD_ID>` / creative metadata read edges where available and permissioned.
- `GET /act_<AD_ACCOUNT_ID>/insights`
- `GET /<CAMPAIGN_ID>/insights`
- `GET /<ADSET_ID>/insights`
- `GET /<AD_ID>/insights`
- `GET /act_<AD_ACCOUNT_ID>/insights/feature-settings/list-features`
- `GET /act_<AD_ACCOUNT_ID>/insights/feature-settings`

## Metrics field strategy

Request explicit fields in capability groups:

- Core delivery: `spend`, `impressions`, `reach`, `frequency`, `clicks`, `inline_link_clicks`, `outbound_clicks` where supported, `cpm`, `cpc`, `ctr` for reference/provenance but deterministic engine recalculates where possible.
- Entity identifiers/names: `account_id`, `account_name`, `campaign_id`, `campaign_name`, `adset_id`, `adset_name`, `ad_id`, `ad_name`.
- Actions/value: `actions`, `action_values`, `cost_per_action_type`, `purchase_roas`, `website_purchase_roas`, `mobile_app_purchase_roas` where supported. Normalization will select configured conversion action types rather than summing arbitrary nested actions.
- Video/engagement: stored as optional action metrics by action type and surfaced only when present.

## Breakdown capability strategy

The platform will model breakdowns as metadata rather than hard-coded UI assumptions:

```ts
type BreakdownCapability = {
  key: string;
  label: string;
  category: 'audience' | 'geo' | 'platform' | 'device' | 'time' | 'action' | 'asset';
  supportedLevels: Array<'account' | 'campaign' | 'adset' | 'ad'>;
  combinableWith: string[][];
  incompatibleFields: string[];
  requiresFeature?: string;
  notes: string[];
};
```

Initial supported UI dimensions:

- `age`
- `gender`
- `age,gender`
- `country`
- `region`
- `publisher_platform`
- `publisher_platform,platform_position`
- `publisher_platform,platform_position,impression_device`
- `device_platform`
- `impression_device` where enabled/valid in combinations
- `hourly_stats_aggregated_by_advertiser_time_zone`
- `hourly_stats_aggregated_by_audience_time_zone` where enabled/available

Current important limitations from official docs:

- Some fields cannot be requested with any breakdown: `app_store_clicks`, `newsfeed_avg_position`, `newsfeed_clicks`, `relevance_score`, `newsfeed_impressions`.
- Some off-Meta action metrics are unavailable or have suppressed breakdown values for certain breakdowns.
- Hourly breakdowns do not support unique fields, `reach`, or `frequency`; docs state these can return 0 under hourly breakdowns, so the platform will mark them unsupported for hourly reports rather than presenting those zeros as true reach/frequency.
- Video fields cannot be requested with hourly stats breakdowns.
- `video_avg_time_watched_actions` cannot be requested with `region`.
- Some breakdowns, including `impression_device`, audience-time hourly, and `frequency_value`, may require account feature enablement or async report jobs.
- Reach/frequency for breakdown queries older than 13 months may be omitted or throttled; the platform must display omission explicitly.

## Implemented live read-only provider

Milestone 13 adds `GraphApiMetaAdsProvider`, which implements the same read-only `MetaAdsProvider` interface as the deterministic mock provider.

Implemented reads:

- `GET /me/adaccounts` with explicit account metadata fields.
- `GET /act_<AD_ACCOUNT_ID>/campaigns`.
- `GET /act_<AD_ACCOUNT_ID>/adsets` with optional campaign filtering.
- `GET /act_<AD_ACCOUNT_ID>/ads` with optional ad set filtering.
- `GET /<AD_ID>` and `GET /<CREATIVE_ID>` for selected creative metadata.
- `GET /act_<AD_ACCOUNT_ID>/insights` for account/campaign/adset/ad reporting levels.
- `GET /act_<AD_ACCOUNT_ID>/insights` with `breakdowns` for supported breakdown requests.

Configuration:

- `META_PROVIDER=mock` keeps all dashboards on deterministic mock data.
- `META_PROVIDER=graph-api` enables the live provider for configured sync workers and provider factory usage.
- `META_SYSTEM_USER_ACCESS_TOKEN` is required for graph-api mode and must be configured outside Git.
- `META_APP_SECRET` is optional but, when present, the HTTP client adds `appsecret_proof` to Graph requests.
- `META_GRAPH_API_VERSION` defaults to `v26.0`.

Accuracy behavior:

- Numeric Meta strings are parsed deterministically.
- Missing numeric fields become `null_from_source`, not zero.
- Empty numeric provider values become null/unavailable, not guessed values.
- Conversion counts and conversion value are extracted only from allowlisted action types in `actions` and `action_values`.
- Currency and timezone come from ad account metadata and are carried onto insight rows.
- Attribution context is preserved as provider metadata for downstream reporting caveats.

Error/rate-limit behavior:

- Graph requests use bounded request timeouts and normalize timeout failures into retryable `MetaApiError` values.
- Graph errors are normalized into `MetaApiError` with safe details only.
- Permission/auth errors are non-retryable.
- Rate-limit/transient errors are retryable so BullMQ can apply bounded exponential retries.
- `x-fb-ads-insights-throttle` and `x-ad-account-usage` presence is logged without exposing tokens or raw headers.

Safety behavior:

- No campaign/ad set/ad/creative/budget/targeting write endpoint exists.
- The HTTP client currently performs only GET requests.
- The app does not request `ads_management`; Phase 1 uses `ads_read` for reporting.

## Remaining live integration follow-up

1. Persist live sync runs, raw ingestion payloads, normalized hierarchy, normalized metrics, breakdown rows, and validation errors into PostgreSQL.
2. Move dashboard/report data services from mock provider reads to persisted verified app data.
3. Add async report-run support for high-volume backfills and high-cardinality breakdowns.
4. Add production request pacing based on parsed throttle header values.
5. Add operational dashboards for sync run state and failed-account remediation.
