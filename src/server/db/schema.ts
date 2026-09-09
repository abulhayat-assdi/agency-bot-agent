import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
};

const archiveColumns = {
  archivedAt: timestamp("archived_at", { withTimezone: true })
};

export const userRoleEnum = pgEnum("user_role", ["admin", "analyst", "viewer"]);
export const userStatusEnum = pgEnum("user_status", ["active", "invited", "disabled"]);
export const clientStatusEnum = pgEnum("client_status", ["active", "paused", "archived"]);
export const providerEnum = pgEnum("ad_provider", ["meta"]);
export const providerModeEnum = pgEnum("provider_mode", ["mock", "graph_api"]);
export const accountStatusEnum = pgEnum("ad_account_status", ["active", "disabled", "pending", "archived"]);
export const accessStatusEnum = pgEnum("access_status", ["connected", "needs_attention", "revoked", "unknown"]);
export const entityStatusEnum = pgEnum("meta_entity_status", ["active", "paused", "deleted", "archived", "unknown"]);
export const syncTypeEnum = pgEnum("sync_type", ["scheduled", "manual", "backfill", "incremental"]);
export const syncStatusEnum = pgEnum("sync_status", ["queued", "running", "success", "partial", "failed", "cancelled"]);
export const syncSeverityEnum = pgEnum("sync_severity", ["info", "warning", "error", "critical"]);
export const entityLevelEnum = pgEnum("entity_level", ["account", "campaign", "adset", "ad"]);
export const availabilityStateEnum = pgEnum("availability_state", [
  "available",
  "actual_zero",
  "null_from_source",
  "unavailable",
  "unsupported",
  "insufficient_data",
  "api_error",
  "partial"
]);
export const anomalySeverityEnum = pgEnum("anomaly_severity", ["info", "warning", "critical"]);
export const anomalyStateEnum = pgEnum("anomaly_state", ["open", "acknowledged", "resolved", "ignored"]);
export const aiMessageRoleEnum = pgEnum("ai_message_role", ["user", "assistant", "tool", "system"]);
export const emailReportTypeEnum = pgEnum("email_report_type", [
  "account_summary",
  "campaign_report",
  "adset_report",
  "ad_report",
  "ai_summary",
  "performance_alerts",
  "custom"
]);
export const deliveryStatusEnum = pgEnum("delivery_status", ["queued", "sent", "failed", "skipped"]);

export const agencies = pgTable(
  "agencies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 180 }).notNull(),
    slug: varchar("slug", { length: 120 }).notNull(),
    timezone: varchar("timezone", { length: 80 }).notNull().default("UTC"),
    ...timestamps,
    ...archiveColumns
  },
  (table) => [uniqueIndex("agencies_slug_uidx").on(table.slug)]
);

export const adminUsers = pgTable(
  "admin_users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id").notNull().references(() => agencies.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 320 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    name: varchar("name", { length: 180 }),
    role: userRoleEnum("role").notNull().default("admin"),
    status: userStatusEnum("status").notNull().default("active"),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    ...timestamps,
    ...archiveColumns
  },
  (table) => [uniqueIndex("admin_users_email_uidx").on(table.email), index("admin_users_agency_idx").on(table.agencyId)]
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => adminUsers.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipHash: text("ip_hash"),
    userAgentHash: text("user_agent_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true })
  },
  (table) => [uniqueIndex("sessions_token_hash_uidx").on(table.tokenHash), index("sessions_user_expires_idx").on(table.userId, table.expiresAt)]
);

export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    emailHash: text("email_hash").notNull(),
    ipHash: text("ip_hash").notNull(),
    success: boolean("success").notNull().default(false),
    failureReason: text("failure_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [index("login_attempts_email_time_idx").on(table.emailHash, table.createdAt), index("login_attempts_ip_time_idx").on(table.ipHash, table.createdAt)]
);

export const clients = pgTable(
  "clients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id").notNull().references(() => agencies.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 180 }).notNull(),
    slug: varchar("slug", { length: 140 }).notNull(),
    status: clientStatusEnum("status").notNull().default("active"),
    defaultTimezone: varchar("default_timezone", { length: 80 }),
    notes: text("notes"),
    ...timestamps,
    ...archiveColumns
  },
  (table) => [uniqueIndex("clients_agency_slug_uidx").on(table.agencyId, table.slug), index("clients_agency_status_idx").on(table.agencyId, table.status)]
);

export const adAccounts = pgTable(
  "ad_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id").notNull().references(() => agencies.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
    provider: providerEnum("provider").notNull().default("meta"),
    providerMode: providerModeEnum("provider_mode").notNull().default("mock"),
    metaAccountId: varchar("meta_account_id", { length: 80 }).notNull(),
    name: varchar("name", { length: 220 }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    timezone: varchar("timezone", { length: 80 }).notNull(),
    status: accountStatusEnum("status").notNull().default("active"),
    accessStatus: accessStatusEnum("access_status").notNull().default("unknown"),
    connectionMetadata: jsonb("connection_metadata").$type<Record<string, unknown>>().notNull().default({}),
    lastSuccessfulSyncAt: timestamp("last_successful_sync_at", { withTimezone: true }),
    lastSyncState: syncStatusEnum("last_sync_state"),
    ...timestamps,
    ...archiveColumns
  },
  (table) => [
    uniqueIndex("ad_accounts_provider_meta_uidx").on(table.provider, table.metaAccountId),
    index("ad_accounts_agency_client_idx").on(table.agencyId, table.clientId),
    index("ad_accounts_sync_state_idx").on(table.lastSyncState)
  ]
);

export const campaigns = pgTable(
  "campaigns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    adAccountId: uuid("ad_account_id").notNull().references(() => adAccounts.id, { onDelete: "cascade" }),
    metaCampaignId: varchar("meta_campaign_id", { length: 80 }).notNull(),
    name: varchar("name", { length: 300 }).notNull(),
    status: entityStatusEnum("status").notNull().default("unknown"),
    effectiveStatus: varchar("effective_status", { length: 80 }),
    objective: varchar("objective", { length: 120 }),
    buyingType: varchar("buying_type", { length: 80 }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    stoppedAt: timestamp("stopped_at", { withTimezone: true }),
    rawLastSeenAt: timestamp("raw_last_seen_at", { withTimezone: true }),
    ...timestamps,
    ...archiveColumns
  },
  (table) => [uniqueIndex("campaigns_account_meta_uidx").on(table.adAccountId, table.metaCampaignId), index("campaigns_account_status_idx").on(table.adAccountId, table.status)]
);

export const adSets = pgTable(
  "ad_sets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    adAccountId: uuid("ad_account_id").notNull().references(() => adAccounts.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
    metaAdsetId: varchar("meta_adset_id", { length: 80 }).notNull(),
    name: varchar("name", { length: 300 }).notNull(),
    status: entityStatusEnum("status").notNull().default("unknown"),
    effectiveStatus: varchar("effective_status", { length: 80 }),
    optimizationGoal: varchar("optimization_goal", { length: 120 }),
    billingEvent: varchar("billing_event", { length: 120 }),
    attributionSpec: jsonb("attribution_spec_json").$type<Record<string, unknown> | null>(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    stoppedAt: timestamp("stopped_at", { withTimezone: true }),
    rawLastSeenAt: timestamp("raw_last_seen_at", { withTimezone: true }),
    ...timestamps,
    ...archiveColumns
  },
  (table) => [
    uniqueIndex("ad_sets_account_meta_uidx").on(table.adAccountId, table.metaAdsetId),
    index("ad_sets_campaign_idx").on(table.campaignId),
    index("ad_sets_account_status_idx").on(table.adAccountId, table.status)
  ]
);

export const ads = pgTable(
  "ads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    adAccountId: uuid("ad_account_id").notNull().references(() => adAccounts.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
    adSetId: uuid("ad_set_id").notNull().references(() => adSets.id, { onDelete: "cascade" }),
    metaAdId: varchar("meta_ad_id", { length: 80 }).notNull(),
    name: varchar("name", { length: 300 }).notNull(),
    status: entityStatusEnum("status").notNull().default("unknown"),
    effectiveStatus: varchar("effective_status", { length: 80 }),
    creativeId: varchar("creative_id", { length: 80 }),
    rawLastSeenAt: timestamp("raw_last_seen_at", { withTimezone: true }),
    ...timestamps,
    ...archiveColumns
  },
  (table) => [
    uniqueIndex("ads_account_meta_uidx").on(table.adAccountId, table.metaAdId),
    index("ads_adset_idx").on(table.adSetId),
    index("ads_campaign_idx").on(table.campaignId),
    index("ads_account_status_idx").on(table.adAccountId, table.status)
  ]
);

export const creativeMetadata = pgTable(
  "creative_metadata",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    adId: uuid("ad_id").notNull().references(() => ads.id, { onDelete: "cascade" }),
    metaCreativeId: varchar("meta_creative_id", { length: 80 }).notNull(),
    name: varchar("name", { length: 300 }),
    pageId: varchar("page_id", { length: 80 }),
    instagramActorId: varchar("instagram_actor_id", { length: 80 }),
    thumbnailUrl: text("thumbnail_url"),
    objectType: varchar("object_type", { length: 80 }),
    metadata: jsonb("metadata_json").$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps
  },
  (table) => [uniqueIndex("creative_metadata_ad_creative_uidx").on(table.adId, table.metaCreativeId)]
);

export const syncRuns = pgTable(
  "sync_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id").notNull().references(() => agencies.id, { onDelete: "cascade" }),
    adAccountId: uuid("ad_account_id").references(() => adAccounts.id, { onDelete: "set null" }),
    provider: providerEnum("provider").notNull().default("meta"),
    providerMode: providerModeEnum("provider_mode").notNull().default("mock"),
    type: syncTypeEnum("type").notNull(),
    status: syncStatusEnum("status").notNull().default("queued"),
    requestedByUserId: uuid("requested_by_user_id").references(() => adminUsers.id, { onDelete: "set null" }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    checkpoint: jsonb("checkpoint_json").$type<Record<string, unknown>>().notNull().default({}),
    stats: jsonb("stats_json").$type<Record<string, unknown>>().notNull().default({}),
    errorSummary: text("error_summary"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [index("sync_runs_account_status_idx").on(table.adAccountId, table.status), index("sync_runs_created_idx").on(table.createdAt)]
);

export const syncErrors = pgTable(
  "sync_errors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    syncRunId: uuid("sync_run_id").notNull().references(() => syncRuns.id, { onDelete: "cascade" }),
    adAccountId: uuid("ad_account_id").references(() => adAccounts.id, { onDelete: "set null" }),
    severity: syncSeverityEnum("severity").notNull().default("error"),
    providerCode: varchar("provider_code", { length: 80 }),
    providerSubcode: varchar("provider_subcode", { length: 80 }),
    safeMessage: text("safe_message").notNull(),
    retryable: boolean("retryable").notNull().default(false),
    requestContext: jsonb("request_context_json").$type<Record<string, unknown>>().notNull().default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [index("sync_errors_run_idx").on(table.syncRunId), index("sync_errors_account_time_idx").on(table.adAccountId, table.occurredAt)]
);

export const rawIngestionRecords = pgTable(
  "raw_ingestion_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    syncRunId: uuid("sync_run_id").notNull().references(() => syncRuns.id, { onDelete: "cascade" }),
    adAccountId: uuid("ad_account_id").notNull().references(() => adAccounts.id, { onDelete: "cascade" }),
    source: varchar("source", { length: 120 }).notNull(),
    sourceObjectId: varchar("source_object_id", { length: 120 }),
    endpoint: text("endpoint").notNull(),
    requestHash: text("request_hash").notNull(),
    responsePageCursor: text("response_page_cursor"),
    payload: jsonb("payload_json").$type<Record<string, unknown>>().notNull(),
    payloadHash: text("payload_hash").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [index("raw_ingestion_sync_idx").on(table.syncRunId), index("raw_ingestion_account_source_idx").on(table.adAccountId, table.source, table.sourceObjectId)]
);

export const dataAvailability = pgTable(
  "data_availability",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    adAccountId: uuid("ad_account_id").notNull().references(() => adAccounts.id, { onDelete: "cascade" }),
    entityLevel: entityLevelEnum("entity_level").notNull(),
    entityId: uuid("entity_id"),
    entityKey: varchar("entity_key", { length: 140 }).notNull(),
    metricKey: varchar("metric_key", { length: 120 }).notNull(),
    breakdownKey: varchar("breakdown_key", { length: 220 }),
    dateStart: date("date_start").notNull(),
    dateStop: date("date_stop").notNull(),
    state: availabilityStateEnum("state").notNull(),
    reason: text("reason"),
    syncRunId: uuid("sync_run_id").references(() => syncRuns.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [index("data_availability_lookup_idx").on(table.adAccountId, table.entityLevel, table.entityKey, table.metricKey, table.dateStart, table.dateStop)]
);

const metricColumns = {
  timezone: varchar("timezone", { length: 80 }).notNull(),
  currency: varchar("currency", { length: 3 }).notNull(),
  attributionContext: jsonb("attribution_context_json").$type<Record<string, unknown>>().notNull().default({}),
  spend: numeric("spend", { precision: 18, scale: 6 }),
  impressions: integer("impressions"),
  reach: integer("reach"),
  clicks: integer("clicks"),
  linkClicks: integer("link_clicks"),
  outboundClicks: integer("outbound_clicks"),
  conversions: numeric("conversions", { precision: 18, scale: 6 }),
  conversionValue: numeric("conversion_value", { precision: 18, scale: 6 }),
  videoMetrics: jsonb("video_metrics_json").$type<Record<string, unknown>>().notNull().default({}),
  engagementMetrics: jsonb("engagement_metrics_json").$type<Record<string, unknown>>().notNull().default({}),
  actionMetrics: jsonb("action_metrics_json").$type<Record<string, unknown>>().notNull().default({}),
  sourceFields: jsonb("source_fields_json").$type<Record<string, unknown>>().notNull().default({}),
  availabilityState: availabilityStateEnum("availability_state").notNull().default("available")
};

export const metricDaily = pgTable(
  "metric_daily",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    adAccountId: uuid("ad_account_id").notNull().references(() => adAccounts.id, { onDelete: "cascade" }),
    entityLevel: entityLevelEnum("entity_level").notNull(),
    entityId: uuid("entity_id"),
    entityKey: varchar("entity_key", { length: 140 }).notNull(),
    date: date("date").notNull(),
    ...metricColumns,
    syncRunId: uuid("sync_run_id").references(() => syncRuns.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("metric_daily_scope_uidx").on(table.adAccountId, table.entityLevel, table.entityKey, table.date),
    index("metric_daily_account_date_idx").on(table.adAccountId, table.date),
    index("metric_daily_entity_date_idx").on(table.entityLevel, table.entityKey, table.date)
  ]
);

export const metricPeriod = pgTable(
  "metric_period",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    adAccountId: uuid("ad_account_id").notNull().references(() => adAccounts.id, { onDelete: "cascade" }),
    entityLevel: entityLevelEnum("entity_level").notNull(),
    entityId: uuid("entity_id"),
    entityKey: varchar("entity_key", { length: 140 }).notNull(),
    dateStart: date("date_start").notNull(),
    dateStop: date("date_stop").notNull(),
    ...metricColumns,
    syncRunId: uuid("sync_run_id").references(() => syncRuns.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("metric_period_scope_uidx").on(table.adAccountId, table.entityLevel, table.entityKey, table.dateStart, table.dateStop),
    index("metric_period_account_dates_idx").on(table.adAccountId, table.dateStart, table.dateStop)
  ]
);

export const breakdownMetricDaily = pgTable(
  "breakdown_metric_daily",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    adAccountId: uuid("ad_account_id").notNull().references(() => adAccounts.id, { onDelete: "cascade" }),
    entityLevel: entityLevelEnum("entity_level").notNull(),
    entityId: uuid("entity_id"),
    entityKey: varchar("entity_key", { length: 140 }).notNull(),
    date: date("date").notNull(),
    breakdownKey: varchar("breakdown_key", { length: 220 }).notNull(),
    breakdownValues: jsonb("breakdown_values_json").$type<Record<string, string>>().notNull(),
    breakdownHash: varchar("breakdown_hash", { length: 128 }).notNull(),
    ...metricColumns,
    syncRunId: uuid("sync_run_id").references(() => syncRuns.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index("breakdown_metric_lookup_idx").on(table.adAccountId, table.entityLevel, table.entityKey, table.breakdownKey, table.date),
    uniqueIndex("breakdown_metric_scope_uidx").on(table.adAccountId, table.entityLevel, table.entityKey, table.breakdownKey, table.breakdownHash, table.date),
    index("breakdown_metric_account_date_idx").on(table.adAccountId, table.date)
  ]
);

export const anomalyEvents = pgTable(
  "anomaly_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    adAccountId: uuid("ad_account_id").notNull().references(() => adAccounts.id, { onDelete: "cascade" }),
    entityLevel: entityLevelEnum("entity_level").notNull(),
    entityId: uuid("entity_id"),
    entityKey: varchar("entity_key", { length: 140 }).notNull(),
    metricKey: varchar("metric_key", { length: 120 }).notNull(),
    dateStart: date("date_start").notNull(),
    dateStop: date("date_stop").notNull(),
    severity: anomalySeverityEnum("severity").notNull().default("warning"),
    anomalyType: varchar("anomaly_type", { length: 120 }).notNull(),
    currentValue: numeric("current_value", { precision: 18, scale: 6 }),
    baselineValue: numeric("baseline_value", { precision: 18, scale: 6 }),
    absoluteChange: numeric("absolute_change", { precision: 18, scale: 6 }),
    percentageChange: numeric("percentage_change", { precision: 18, scale: 6 }),
    threshold: jsonb("threshold_json").$type<Record<string, unknown>>().notNull().default({}),
    state: anomalyStateEnum("state").notNull().default("open"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [index("anomaly_events_account_dates_idx").on(table.adAccountId, table.dateStart, table.dateStop), index("anomaly_events_entity_idx").on(table.entityLevel, table.entityKey)]
);

export const aiConversations = pgTable(
  "ai_conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id").notNull().references(() => agencies.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => adminUsers.id, { onDelete: "set null" }),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
    adAccountId: uuid("ad_account_id").references(() => adAccounts.id, { onDelete: "set null" }),
    title: varchar("title", { length: 240 }).notNull(),
    ...timestamps,
    ...archiveColumns
  },
  (table) => [index("ai_conversations_agency_idx").on(table.agencyId, table.updatedAt)]
);

export const aiMessages = pgTable(
  "ai_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id").notNull().references(() => aiConversations.id, { onDelete: "cascade" }),
    role: aiMessageRoleEnum("role").notNull(),
    content: text("content").notNull(),
    toolCalls: jsonb("tool_calls_json").$type<Record<string, unknown>[]>().notNull().default([]),
    groundedContext: jsonb("grounded_context_json").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [index("ai_messages_conversation_idx").on(table.conversationId, table.createdAt)]
);

export const aiInsights = pgTable(
  "ai_insights",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id").notNull().references(() => agencies.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
    adAccountId: uuid("ad_account_id").references(() => adAccounts.id, { onDelete: "cascade" }),
    entityLevel: entityLevelEnum("entity_level"),
    entityId: uuid("entity_id"),
    dateStart: date("date_start").notNull(),
    dateStop: date("date_stop").notNull(),
    insightType: varchar("insight_type", { length: 120 }).notNull(),
    content: text("content").notNull(),
    evidence: jsonb("evidence_json").$type<Record<string, unknown>>().notNull().default({}),
    caveats: jsonb("caveats_json").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [index("ai_insights_scope_idx").on(table.agencyId, table.clientId, table.adAccountId, table.dateStart, table.dateStop)]
);

export const emailReports = pgTable(
  "email_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id").notNull().references(() => agencies.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "cascade" }),
    adAccountId: uuid("ad_account_id").references(() => adAccounts.id, { onDelete: "cascade" }),
    entityLevel: entityLevelEnum("entity_level"),
    entityId: uuid("entity_id"),
    name: varchar("name", { length: 220 }).notNull(),
    reportType: emailReportTypeEnum("report_type").notNull(),
    enabled: boolean("enabled").notNull().default(false),
    schedule: jsonb("schedule_json").$type<Record<string, unknown>>().notNull().default({}),
    timezone: varchar("timezone", { length: 80 }).notNull(),
    ...timestamps,
    ...archiveColumns
  },
  (table) => [index("email_reports_agency_enabled_idx").on(table.agencyId, table.enabled), index("email_reports_account_idx").on(table.adAccountId)]
);

export const emailRecipients = pgTable(
  "email_recipients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    emailReportId: uuid("email_report_id").notNull().references(() => emailReports.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 320 }).notNull(),
    name: varchar("name", { length: 180 }),
    status: userStatusEnum("status").notNull().default("active"),
    ...timestamps
  },
  (table) => [uniqueIndex("email_recipients_report_email_uidx").on(table.emailReportId, table.email)]
);

export const emailDeliveryLogs = pgTable(
  "email_delivery_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    emailReportId: uuid("email_report_id").notNull().references(() => emailReports.id, { onDelete: "cascade" }),
    status: deliveryStatusEnum("status").notNull().default("queued"),
    providerMessageId: text("provider_message_id"),
    recipientCount: integer("recipient_count").notNull().default(0),
    safeError: text("safe_error"),
    renderedSubject: text("rendered_subject"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [index("email_delivery_report_time_idx").on(table.emailReportId, table.createdAt)]
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id").notNull().references(() => agencies.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => adminUsers.id, { onDelete: "set null" }),
    action: varchar("action", { length: 160 }).notNull(),
    resourceType: varchar("resource_type", { length: 120 }).notNull(),
    resourceId: uuid("resource_id"),
    metadata: jsonb("metadata_json").$type<Record<string, unknown>>().notNull().default({}),
    ipHash: text("ip_hash"),
    userAgentHash: text("user_agent_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [index("audit_logs_agency_time_idx").on(table.agencyId, table.createdAt), index("audit_logs_resource_idx").on(table.resourceType, table.resourceId)]
);

export const systemSettings = pgTable(
  "system_settings",
  {
    agencyId: uuid("agency_id").notNull().references(() => agencies.id, { onDelete: "cascade" }),
    key: varchar("key", { length: 160 }).notNull(),
    value: jsonb("value_json").$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps
  },
  (table) => [primaryKey({ name: "system_settings_pk", columns: [table.agencyId, table.key] })]
);

export type Agency = typeof agencies.$inferSelect;
export type NewAgency = typeof agencies.$inferInsert;
export type Client = typeof clients.$inferSelect;
export type NewClient = typeof clients.$inferInsert;
export type AdAccount = typeof adAccounts.$inferSelect;
export type NewAdAccount = typeof adAccounts.$inferInsert;
export type Campaign = typeof campaigns.$inferSelect;
export type NewCampaign = typeof campaigns.$inferInsert;
export type AdSet = typeof adSets.$inferSelect;
export type NewAdSet = typeof adSets.$inferInsert;
export type Ad = typeof ads.$inferSelect;
export type NewAd = typeof ads.$inferInsert;
export type MetricDaily = typeof metricDaily.$inferSelect;
export type NewMetricDaily = typeof metricDaily.$inferInsert;
