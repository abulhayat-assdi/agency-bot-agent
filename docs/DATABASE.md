# Database Design

Database: PostgreSQL.

## Design principles

- Multi-client and multi-ad-account from day one.
- Separate raw ingestion metadata from normalized entities and analytics-ready metrics.
- Store provenance for every important metric.
- Never mix currencies silently.
- Use the Meta ad account timezone for reporting dates.
- Use nullable values and explicit availability states instead of converting missing metrics to zero.

## Core schema draft

### Tenancy and users

- `agencies(id, name, slug, timezone, created_at, updated_at, archived_at)`
- `admin_users(id, agency_id, email, password_hash, name, role, status, last_login_at, created_at, updated_at, archived_at)`
- `sessions(id, user_id, token_hash, expires_at, ip_hash, user_agent_hash, created_at, revoked_at)`
- `login_attempts(id, email_hash, ip_hash, success, failure_reason, created_at)`

### Client hierarchy

- `clients(id, agency_id, name, slug, status, default_timezone, notes, created_at, updated_at, archived_at)`
- `ad_accounts(id, agency_id, client_id, provider, meta_account_id, name, currency, timezone, status, access_status, last_successful_sync_at, last_sync_state, created_at, updated_at, archived_at)`
- `campaigns(id, ad_account_id, meta_campaign_id, name, status, effective_status, objective, buying_type, started_at, stopped_at, raw_last_seen_at, created_at, updated_at, archived_at)`
- `ad_sets(id, ad_account_id, campaign_id, meta_adset_id, name, status, effective_status, optimization_goal, billing_event, attribution_spec_json, started_at, stopped_at, raw_last_seen_at, created_at, updated_at, archived_at)`
- `ads(id, ad_account_id, campaign_id, ad_set_id, meta_ad_id, name, status, effective_status, creative_id, raw_last_seen_at, created_at, updated_at, archived_at)`
- `creative_metadata(id, ad_id, meta_creative_id, name, page_id, instagram_actor_id, thumbnail_url, object_type, metadata_json, created_at, updated_at)`

Unique constraints:

- `(agency_id, slug)` for agencies/clients where relevant.
- `(ad_account_id, meta_campaign_id)` on campaigns.
- `(ad_account_id, meta_adset_id)` on ad sets.
- `(ad_account_id, meta_ad_id)` on ads.

### Ingestion and sync

- `sync_runs(id, agency_id, ad_account_id, provider, type, status, requested_by_user_id, started_at, finished_at, checkpoint_json, stats_json, error_summary, created_at)`
- `sync_errors(id, sync_run_id, ad_account_id, severity, provider_code, provider_subcode, safe_message, retryable, request_context_json, occurred_at)`
- `raw_ingestion_records(id, sync_run_id, ad_account_id, source, source_object_id, endpoint, request_hash, response_page_cursor, payload_json, payload_hash, received_at)`
- `data_availability(id, ad_account_id, entity_level, entity_id, metric_key, breakdown_key, date_start, date_stop, state, reason, sync_run_id, created_at)`

### Metrics

- `metric_daily(id, ad_account_id, entity_level, entity_id, date, timezone, currency, attribution_context_json, spend, impressions, reach, clicks, link_clicks, outbound_clicks, conversions, conversion_value, video_metrics_json, engagement_metrics_json, action_metrics_json, source_fields_json, availability_state, sync_run_id, created_at)`
- `metric_period(id, ad_account_id, entity_level, entity_id, date_start, date_stop, timezone, currency, attribution_context_json, same metric columns..., availability_state, sync_run_id, created_at)`
- `breakdown_metric_daily(id, ad_account_id, entity_level, entity_id, date, breakdown_key, breakdown_values_json, timezone, currency, same metric columns..., availability_state, sync_run_id, created_at)`

Indexes:

- `metric_daily(ad_account_id, entity_level, entity_id, date)`
- `metric_daily(ad_account_id, date)`
- `metric_period(ad_account_id, entity_level, entity_id, date_start, date_stop)`
- `breakdown_metric_daily(ad_account_id, entity_level, entity_id, breakdown_key, date)`
- GIN indexes only for JSONB fields that are queried, not by default.

### Analytics, AI, and reporting

- `anomaly_events(id, ad_account_id, entity_level, entity_id, metric_key, date_start, date_stop, severity, anomaly_type, current_value, baseline_value, absolute_change, percentage_change, threshold_json, state, created_at)`
- `ai_conversations(id, agency_id, user_id, client_id, ad_account_id, title, created_at, updated_at, archived_at)`
- `ai_messages(id, conversation_id, role, content, tool_calls_json, grounded_context_json, created_at)`
- `ai_insights(id, agency_id, client_id, ad_account_id, entity_level, entity_id, date_start, date_stop, insight_type, content, evidence_json, caveats_json, created_at)`
- `email_reports(id, agency_id, client_id, ad_account_id, entity_level, entity_id, name, report_type, enabled, schedule_json, timezone, created_at, updated_at, archived_at)`
- `email_recipients(id, email_report_id, email, name, status, created_at, updated_at)`
- `email_delivery_logs(id, email_report_id, status, provider_message_id, recipient_count, safe_error, rendered_subject, sent_at, created_at)`
- `audit_logs(id, agency_id, user_id, action, resource_type, resource_id, metadata_json, ip_hash, user_agent_hash, created_at)`
- `system_settings(id, agency_id, key, value_json, created_at, updated_at)`

## Availability states

Use a constrained enum equivalent:

- `available`
- `actual_zero`
- `null_from_source`
- `unavailable`
- `unsupported`
- `insufficient_data`
- `api_error`
- `partial`

## Migration plan

Milestone 3 will select and implement a TypeScript-friendly migration/data layer. Drizzle or Prisma are both viable. Selection criteria: PostgreSQL migrations, type-safe queries, transactional repositories, JSONB support, and test ergonomics.
