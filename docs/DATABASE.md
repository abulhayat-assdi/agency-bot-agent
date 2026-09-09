# Database Design

Database: PostgreSQL.

Milestone 3 implementation uses Drizzle ORM, `postgres` as the driver, and Drizzle Kit SQL migrations.

## Commands

```bash
npm run db:generate   # generate SQL migrations from schema
npm run db:migrate    # apply migrations using DATABASE_URL
npm run db:studio     # open Drizzle Studio
npm run db:seed       # seed mock agency/client/ad-account metadata
npm run auth:hash-password -- <password>
```

## Design principles

- Multi-client and multi-ad-account from day one.
- Separate raw ingestion metadata from normalized entities and analytics-ready metrics.
- Store provenance for every important metric.
- Never mix currencies silently.
- Use the Meta ad account timezone for reporting dates.
- Use nullable values and explicit availability states instead of converting missing metrics to zero.
- Use `entity_key` with nullable `entity_id` for polymorphic metric scopes so account-level rows can still be uniquely constrained.
- Use `bigint` for large delivery/click counters that may exceed PostgreSQL `integer` range.
- Use `breakdown_hash` for stable uniqueness of JSON breakdown values.

## Implemented schema

Schema source: `src/server/db/schema.ts`

Migrations:

- `drizzle/0000_careful_nick_fury.sql`: initial schema
- `drizzle/0001_mushy_thor_girl.sql`: audit hardening migration removing unused sessions table and converting large counters to `bigint`

### Tenancy and users

- `agencies`
- `admin_users`
- `login_attempts`

### Client hierarchy

- `clients`
- `ad_accounts`
- `campaigns`
- `ad_sets`
- `ads`
- `creative_metadata`

### Ingestion and sync

- `sync_runs`
- `sync_errors`
- `raw_ingestion_records`
- `data_availability`

### Metrics

- `metric_daily`
- `metric_period`
- `breakdown_metric_daily`

Metric rows store:

- ad account
- entity level and stable entity key
- optional normalized entity UUID
- date or date range
- timezone
- currency
- attribution context
- source fields/provenance
- availability state
- sync run reference
- optional video, engagement, and action metric JSON

### Analytics, AI, email, audit, settings

- `anomaly_events`
- `ai_conversations`
- `ai_messages`
- `ai_insights`
- `email_reports`
- `email_recipients`
- `email_delivery_logs`
- `audit_logs`
- `system_settings`

## Core constraints and indexes

Important unique constraints:

- `agencies.slug`
- `admin_users.email`
- `clients(agency_id, slug)`
- `ad_accounts(provider, meta_account_id)`
- `campaigns(ad_account_id, meta_campaign_id)`
- `ad_sets(ad_account_id, meta_adset_id)`
- `ads(ad_account_id, meta_ad_id)`
- `metric_daily(ad_account_id, entity_level, entity_key, date)`
- `metric_period(ad_account_id, entity_level, entity_key, date_start, date_stop)`
- `breakdown_metric_daily(ad_account_id, entity_level, entity_key, breakdown_key, breakdown_hash, date)`

Important lookup indexes cover account/date, hierarchy parent IDs, sync status, data availability, anomalies, AI messages, email delivery logs, and audit log resource lookups.

## Availability states

Constrained by enum:

- `available`
- `actual_zero`
- `null_from_source`
- `unavailable`
- `unsupported`
- `insufficient_data`
- `api_error`
- `partial`

## Repository layer

Implemented repository foundations:

- `AgencyRepository`
- `ClientRepository`
- `AdAccountRepository`
- `MetricsRepository`

Repositories require explicit agency context where tenant scoping is relevant. UI/API handlers should use repositories or query services rather than embedding SQL directly.

## Seed data

`npm run db:seed` creates/upserts:

- demo agency
- demo client
- mock Meta ad account metadata

The seed is safe mock metadata only and does not include spend, conversion, or performance facts.
