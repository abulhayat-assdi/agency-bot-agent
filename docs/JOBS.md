# Redis and BullMQ Job Architecture

Milestone 10 adds the production background-job foundation for read-only Meta sync work. It does not add live Meta Graph API ingestion yet and does not expose any Meta write action.

## Runtime components

- Redis is configured with `REDIS_URL`.
- BullMQ queue name: `meta-sync`.
- Worker command: `npm run jobs:worker`.
- Recurring schedule registration command: `npm run jobs:schedule-sync`.
- Queue readiness endpoint: `/api/jobs/health`.
- Dashboard page: `/sync`.

If `REDIS_URL` is missing, queue and worker startup fail fast instead of silently falling back to in-memory jobs. This prevents production deployments from appearing healthy while background sync is not actually durable.

## Job types

### `sync-ad-account`

Scans one ad account for a supplied date range.

Payload fields:

- `agencyId`
- `accountId`
- `type`: `scheduled`, `manual`, `backfill`, or `incremental`
- `dateRange.since`
- `dateRange.until`
- optional `rollingDatePreset` and `timezone` for scheduled jobs that should calculate a fresh reporting window at execution time
- `includeBreakdowns`
- `traceId`
- optional `requestedByUserId`

### `sync-all-ad-accounts`

Scans all provider accounts available to the worker. In the mock milestone this reads deterministic mock provider accounts; live account scoping and persistence are reserved for the read-only Meta integration milestone.

## Retry and retention policy

Jobs are configured with:

- 5 attempts
- exponential backoff starting at 30 seconds
- completed-job retention for recent audit/debugging
- failed-job retention for longer investigation windows
- conservative worker concurrency of 2

The worker distinguishes retryable provider errors from non-retryable permission/request errors. Non-retryable Meta provider errors are converted into failed worker errors immediately so they can be investigated instead of repeatedly hammering the provider.

## Read-only safety

The worker calls only the existing `MetaAdsProvider` read methods:

- `listAdAccounts`
- `listCampaigns`
- `listAdSets`
- `listAds`
- `getCreative`
- `getInsights`
- `getBreakdowns`

There are no create, edit, delete, pause, resume, budget, targeting, ad, ad set, campaign, or creative mutation APIs in this queue layer.

## Data accuracy behavior

The mock worker scans provider output and returns explicit job statistics:

- accounts scanned
- campaigns scanned
- ad sets scanned
- ads scanned
- creatives scanned
- insight rows scanned
- breakdown rows scanned
- unavailable metric-state count

Unavailable, null, unsupported, partial, and API-error metric states are counted and preserved in the job result. They are not coerced into zero.

## Current limitation

This milestone intentionally stops at durable queue architecture and deterministic read-only provider scanning. Database persistence of raw payloads, normalized metrics, sync run rows, and live Graph API pagination/rate-limit handling belongs to the future read-only Meta integration milestone.
