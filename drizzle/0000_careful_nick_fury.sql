CREATE TYPE "public"."access_status" AS ENUM('connected', 'needs_attention', 'revoked', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."ad_account_status" AS ENUM('active', 'disabled', 'pending', 'archived');--> statement-breakpoint
CREATE TYPE "public"."ai_message_role" AS ENUM('user', 'assistant', 'tool', 'system');--> statement-breakpoint
CREATE TYPE "public"."anomaly_severity" AS ENUM('info', 'warning', 'critical');--> statement-breakpoint
CREATE TYPE "public"."anomaly_state" AS ENUM('open', 'acknowledged', 'resolved', 'ignored');--> statement-breakpoint
CREATE TYPE "public"."availability_state" AS ENUM('available', 'actual_zero', 'null_from_source', 'unavailable', 'unsupported', 'insufficient_data', 'api_error', 'partial');--> statement-breakpoint
CREATE TYPE "public"."client_status" AS ENUM('active', 'paused', 'archived');--> statement-breakpoint
CREATE TYPE "public"."delivery_status" AS ENUM('queued', 'sent', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."email_report_type" AS ENUM('account_summary', 'campaign_report', 'adset_report', 'ad_report', 'ai_summary', 'performance_alerts', 'custom');--> statement-breakpoint
CREATE TYPE "public"."entity_level" AS ENUM('account', 'campaign', 'adset', 'ad');--> statement-breakpoint
CREATE TYPE "public"."meta_entity_status" AS ENUM('active', 'paused', 'deleted', 'archived', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."ad_provider" AS ENUM('meta');--> statement-breakpoint
CREATE TYPE "public"."provider_mode" AS ENUM('mock', 'graph_api');--> statement-breakpoint
CREATE TYPE "public"."sync_severity" AS ENUM('info', 'warning', 'error', 'critical');--> statement-breakpoint
CREATE TYPE "public"."sync_status" AS ENUM('queued', 'running', 'success', 'partial', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."sync_type" AS ENUM('scheduled', 'manual', 'backfill', 'incremental');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'analyst', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'invited', 'disabled');--> statement-breakpoint
CREATE TABLE "ad_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"provider" "ad_provider" DEFAULT 'meta' NOT NULL,
	"provider_mode" "provider_mode" DEFAULT 'mock' NOT NULL,
	"meta_account_id" varchar(80) NOT NULL,
	"name" varchar(220) NOT NULL,
	"currency" varchar(3) NOT NULL,
	"timezone" varchar(80) NOT NULL,
	"status" "ad_account_status" DEFAULT 'active' NOT NULL,
	"access_status" "access_status" DEFAULT 'unknown' NOT NULL,
	"connection_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_successful_sync_at" timestamp with time zone,
	"last_sync_state" "sync_status",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ad_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ad_account_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"meta_adset_id" varchar(80) NOT NULL,
	"name" varchar(300) NOT NULL,
	"status" "meta_entity_status" DEFAULT 'unknown' NOT NULL,
	"effective_status" varchar(80),
	"optimization_goal" varchar(120),
	"billing_event" varchar(120),
	"attribution_spec_json" jsonb,
	"started_at" timestamp with time zone,
	"stopped_at" timestamp with time zone,
	"raw_last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "admin_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"email" varchar(320) NOT NULL,
	"password_hash" text NOT NULL,
	"name" varchar(180),
	"role" "user_role" DEFAULT 'admin' NOT NULL,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ad_account_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"ad_set_id" uuid NOT NULL,
	"meta_ad_id" varchar(80) NOT NULL,
	"name" varchar(300) NOT NULL,
	"status" "meta_entity_status" DEFAULT 'unknown' NOT NULL,
	"effective_status" varchar(80),
	"creative_id" varchar(80),
	"raw_last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "agencies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(180) NOT NULL,
	"slug" varchar(120) NOT NULL,
	"timezone" varchar(80) DEFAULT 'UTC' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ai_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"user_id" uuid,
	"client_id" uuid,
	"ad_account_id" uuid,
	"title" varchar(240) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ai_insights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"client_id" uuid,
	"ad_account_id" uuid,
	"entity_level" "entity_level",
	"entity_id" uuid,
	"date_start" date NOT NULL,
	"date_stop" date NOT NULL,
	"insight_type" varchar(120) NOT NULL,
	"content" text NOT NULL,
	"evidence_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"caveats_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" "ai_message_role" NOT NULL,
	"content" text NOT NULL,
	"tool_calls_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"grounded_context_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "anomaly_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ad_account_id" uuid NOT NULL,
	"entity_level" "entity_level" NOT NULL,
	"entity_id" uuid,
	"entity_key" varchar(140) NOT NULL,
	"metric_key" varchar(120) NOT NULL,
	"date_start" date NOT NULL,
	"date_stop" date NOT NULL,
	"severity" "anomaly_severity" DEFAULT 'warning' NOT NULL,
	"anomaly_type" varchar(120) NOT NULL,
	"current_value" numeric(18, 6),
	"baseline_value" numeric(18, 6),
	"absolute_change" numeric(18, 6),
	"percentage_change" numeric(18, 6),
	"threshold_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"state" "anomaly_state" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"user_id" uuid,
	"action" varchar(160) NOT NULL,
	"resource_type" varchar(120) NOT NULL,
	"resource_id" uuid,
	"metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip_hash" text,
	"user_agent_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "breakdown_metric_daily" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ad_account_id" uuid NOT NULL,
	"entity_level" "entity_level" NOT NULL,
	"entity_id" uuid,
	"entity_key" varchar(140) NOT NULL,
	"date" date NOT NULL,
	"breakdown_key" varchar(220) NOT NULL,
	"breakdown_values_json" jsonb NOT NULL,
	"breakdown_hash" varchar(128) NOT NULL,
	"timezone" varchar(80) NOT NULL,
	"currency" varchar(3) NOT NULL,
	"attribution_context_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"spend" numeric(18, 6),
	"impressions" integer,
	"reach" integer,
	"clicks" integer,
	"link_clicks" integer,
	"outbound_clicks" integer,
	"conversions" numeric(18, 6),
	"conversion_value" numeric(18, 6),
	"video_metrics_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"engagement_metrics_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"action_metrics_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source_fields_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"availability_state" "availability_state" DEFAULT 'available' NOT NULL,
	"sync_run_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ad_account_id" uuid NOT NULL,
	"meta_campaign_id" varchar(80) NOT NULL,
	"name" varchar(300) NOT NULL,
	"status" "meta_entity_status" DEFAULT 'unknown' NOT NULL,
	"effective_status" varchar(80),
	"objective" varchar(120),
	"buying_type" varchar(80),
	"started_at" timestamp with time zone,
	"stopped_at" timestamp with time zone,
	"raw_last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"name" varchar(180) NOT NULL,
	"slug" varchar(140) NOT NULL,
	"status" "client_status" DEFAULT 'active' NOT NULL,
	"default_timezone" varchar(80),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "creative_metadata" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ad_id" uuid NOT NULL,
	"meta_creative_id" varchar(80) NOT NULL,
	"name" varchar(300),
	"page_id" varchar(80),
	"instagram_actor_id" varchar(80),
	"thumbnail_url" text,
	"object_type" varchar(80),
	"metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_availability" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ad_account_id" uuid NOT NULL,
	"entity_level" "entity_level" NOT NULL,
	"entity_id" uuid,
	"entity_key" varchar(140) NOT NULL,
	"metric_key" varchar(120) NOT NULL,
	"breakdown_key" varchar(220),
	"date_start" date NOT NULL,
	"date_stop" date NOT NULL,
	"state" "availability_state" NOT NULL,
	"reason" text,
	"sync_run_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_delivery_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email_report_id" uuid NOT NULL,
	"status" "delivery_status" DEFAULT 'queued' NOT NULL,
	"provider_message_id" text,
	"recipient_count" integer DEFAULT 0 NOT NULL,
	"safe_error" text,
	"rendered_subject" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_recipients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email_report_id" uuid NOT NULL,
	"email" varchar(320) NOT NULL,
	"name" varchar(180),
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"client_id" uuid,
	"ad_account_id" uuid,
	"entity_level" "entity_level",
	"entity_id" uuid,
	"name" varchar(220) NOT NULL,
	"report_type" "email_report_type" NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"schedule_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"timezone" varchar(80) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email_hash" text NOT NULL,
	"ip_hash" text NOT NULL,
	"success" boolean DEFAULT false NOT NULL,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "metric_daily" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ad_account_id" uuid NOT NULL,
	"entity_level" "entity_level" NOT NULL,
	"entity_id" uuid,
	"entity_key" varchar(140) NOT NULL,
	"date" date NOT NULL,
	"timezone" varchar(80) NOT NULL,
	"currency" varchar(3) NOT NULL,
	"attribution_context_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"spend" numeric(18, 6),
	"impressions" integer,
	"reach" integer,
	"clicks" integer,
	"link_clicks" integer,
	"outbound_clicks" integer,
	"conversions" numeric(18, 6),
	"conversion_value" numeric(18, 6),
	"video_metrics_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"engagement_metrics_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"action_metrics_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source_fields_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"availability_state" "availability_state" DEFAULT 'available' NOT NULL,
	"sync_run_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "metric_period" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ad_account_id" uuid NOT NULL,
	"entity_level" "entity_level" NOT NULL,
	"entity_id" uuid,
	"entity_key" varchar(140) NOT NULL,
	"date_start" date NOT NULL,
	"date_stop" date NOT NULL,
	"timezone" varchar(80) NOT NULL,
	"currency" varchar(3) NOT NULL,
	"attribution_context_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"spend" numeric(18, 6),
	"impressions" integer,
	"reach" integer,
	"clicks" integer,
	"link_clicks" integer,
	"outbound_clicks" integer,
	"conversions" numeric(18, 6),
	"conversion_value" numeric(18, 6),
	"video_metrics_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"engagement_metrics_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"action_metrics_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source_fields_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"availability_state" "availability_state" DEFAULT 'available' NOT NULL,
	"sync_run_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "raw_ingestion_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sync_run_id" uuid NOT NULL,
	"ad_account_id" uuid NOT NULL,
	"source" varchar(120) NOT NULL,
	"source_object_id" varchar(120),
	"endpoint" text NOT NULL,
	"request_hash" text NOT NULL,
	"response_page_cursor" text,
	"payload_json" jsonb NOT NULL,
	"payload_hash" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_hash" text,
	"user_agent_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sync_errors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sync_run_id" uuid NOT NULL,
	"ad_account_id" uuid,
	"severity" "sync_severity" DEFAULT 'error' NOT NULL,
	"provider_code" varchar(80),
	"provider_subcode" varchar(80),
	"safe_message" text NOT NULL,
	"retryable" boolean DEFAULT false NOT NULL,
	"request_context_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"ad_account_id" uuid,
	"provider" "ad_provider" DEFAULT 'meta' NOT NULL,
	"provider_mode" "provider_mode" DEFAULT 'mock' NOT NULL,
	"type" "sync_type" NOT NULL,
	"status" "sync_status" DEFAULT 'queued' NOT NULL,
	"requested_by_user_id" uuid,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"checkpoint_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"stats_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error_summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_settings" (
	"agency_id" uuid NOT NULL,
	"key" varchar(160) NOT NULL,
	"value_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "system_settings_pk" PRIMARY KEY("agency_id","key")
);
--> statement-breakpoint
ALTER TABLE "ad_accounts" ADD CONSTRAINT "ad_accounts_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_accounts" ADD CONSTRAINT "ad_accounts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_sets" ADD CONSTRAINT "ad_sets_ad_account_id_ad_accounts_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "public"."ad_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_sets" ADD CONSTRAINT "ad_sets_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ads" ADD CONSTRAINT "ads_ad_account_id_ad_accounts_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "public"."ad_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ads" ADD CONSTRAINT "ads_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ads" ADD CONSTRAINT "ads_ad_set_id_ad_sets_id_fk" FOREIGN KEY ("ad_set_id") REFERENCES "public"."ad_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_user_id_admin_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_ad_account_id_ad_accounts_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "public"."ad_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_insights" ADD CONSTRAINT "ai_insights_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_insights" ADD CONSTRAINT "ai_insights_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_insights" ADD CONSTRAINT "ai_insights_ad_account_id_ad_accounts_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "public"."ad_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_conversation_id_ai_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."ai_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anomaly_events" ADD CONSTRAINT "anomaly_events_ad_account_id_ad_accounts_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "public"."ad_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_admin_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "breakdown_metric_daily" ADD CONSTRAINT "breakdown_metric_daily_ad_account_id_ad_accounts_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "public"."ad_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "breakdown_metric_daily" ADD CONSTRAINT "breakdown_metric_daily_sync_run_id_sync_runs_id_fk" FOREIGN KEY ("sync_run_id") REFERENCES "public"."sync_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_ad_account_id_ad_accounts_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "public"."ad_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_metadata" ADD CONSTRAINT "creative_metadata_ad_id_ads_id_fk" FOREIGN KEY ("ad_id") REFERENCES "public"."ads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_availability" ADD CONSTRAINT "data_availability_ad_account_id_ad_accounts_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "public"."ad_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_availability" ADD CONSTRAINT "data_availability_sync_run_id_sync_runs_id_fk" FOREIGN KEY ("sync_run_id") REFERENCES "public"."sync_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_delivery_logs" ADD CONSTRAINT "email_delivery_logs_email_report_id_email_reports_id_fk" FOREIGN KEY ("email_report_id") REFERENCES "public"."email_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_recipients" ADD CONSTRAINT "email_recipients_email_report_id_email_reports_id_fk" FOREIGN KEY ("email_report_id") REFERENCES "public"."email_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_reports" ADD CONSTRAINT "email_reports_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_reports" ADD CONSTRAINT "email_reports_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_reports" ADD CONSTRAINT "email_reports_ad_account_id_ad_accounts_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "public"."ad_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metric_daily" ADD CONSTRAINT "metric_daily_ad_account_id_ad_accounts_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "public"."ad_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metric_daily" ADD CONSTRAINT "metric_daily_sync_run_id_sync_runs_id_fk" FOREIGN KEY ("sync_run_id") REFERENCES "public"."sync_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metric_period" ADD CONSTRAINT "metric_period_ad_account_id_ad_accounts_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "public"."ad_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metric_period" ADD CONSTRAINT "metric_period_sync_run_id_sync_runs_id_fk" FOREIGN KEY ("sync_run_id") REFERENCES "public"."sync_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_ingestion_records" ADD CONSTRAINT "raw_ingestion_records_sync_run_id_sync_runs_id_fk" FOREIGN KEY ("sync_run_id") REFERENCES "public"."sync_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_ingestion_records" ADD CONSTRAINT "raw_ingestion_records_ad_account_id_ad_accounts_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "public"."ad_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_admin_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_errors" ADD CONSTRAINT "sync_errors_sync_run_id_sync_runs_id_fk" FOREIGN KEY ("sync_run_id") REFERENCES "public"."sync_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_errors" ADD CONSTRAINT "sync_errors_ad_account_id_ad_accounts_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "public"."ad_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_ad_account_id_ad_accounts_id_fk" FOREIGN KEY ("ad_account_id") REFERENCES "public"."ad_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_requested_by_user_id_admin_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ad_accounts_provider_meta_uidx" ON "ad_accounts" USING btree ("provider","meta_account_id");--> statement-breakpoint
CREATE INDEX "ad_accounts_agency_client_idx" ON "ad_accounts" USING btree ("agency_id","client_id");--> statement-breakpoint
CREATE INDEX "ad_accounts_sync_state_idx" ON "ad_accounts" USING btree ("last_sync_state");--> statement-breakpoint
CREATE UNIQUE INDEX "ad_sets_account_meta_uidx" ON "ad_sets" USING btree ("ad_account_id","meta_adset_id");--> statement-breakpoint
CREATE INDEX "ad_sets_campaign_idx" ON "ad_sets" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "ad_sets_account_status_idx" ON "ad_sets" USING btree ("ad_account_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_users_email_uidx" ON "admin_users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "admin_users_agency_idx" ON "admin_users" USING btree ("agency_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ads_account_meta_uidx" ON "ads" USING btree ("ad_account_id","meta_ad_id");--> statement-breakpoint
CREATE INDEX "ads_adset_idx" ON "ads" USING btree ("ad_set_id");--> statement-breakpoint
CREATE INDEX "ads_campaign_idx" ON "ads" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "ads_account_status_idx" ON "ads" USING btree ("ad_account_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "agencies_slug_uidx" ON "agencies" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "ai_conversations_agency_idx" ON "ai_conversations" USING btree ("agency_id","updated_at");--> statement-breakpoint
CREATE INDEX "ai_insights_scope_idx" ON "ai_insights" USING btree ("agency_id","client_id","ad_account_id","date_start","date_stop");--> statement-breakpoint
CREATE INDEX "ai_messages_conversation_idx" ON "ai_messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "anomaly_events_account_dates_idx" ON "anomaly_events" USING btree ("ad_account_id","date_start","date_stop");--> statement-breakpoint
CREATE INDEX "anomaly_events_entity_idx" ON "anomaly_events" USING btree ("entity_level","entity_key");--> statement-breakpoint
CREATE INDEX "audit_logs_agency_time_idx" ON "audit_logs" USING btree ("agency_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_resource_idx" ON "audit_logs" USING btree ("resource_type","resource_id");--> statement-breakpoint
CREATE INDEX "breakdown_metric_lookup_idx" ON "breakdown_metric_daily" USING btree ("ad_account_id","entity_level","entity_key","breakdown_key","date");--> statement-breakpoint
CREATE UNIQUE INDEX "breakdown_metric_scope_uidx" ON "breakdown_metric_daily" USING btree ("ad_account_id","entity_level","entity_key","breakdown_key","breakdown_hash","date");--> statement-breakpoint
CREATE INDEX "breakdown_metric_account_date_idx" ON "breakdown_metric_daily" USING btree ("ad_account_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "campaigns_account_meta_uidx" ON "campaigns" USING btree ("ad_account_id","meta_campaign_id");--> statement-breakpoint
CREATE INDEX "campaigns_account_status_idx" ON "campaigns" USING btree ("ad_account_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "clients_agency_slug_uidx" ON "clients" USING btree ("agency_id","slug");--> statement-breakpoint
CREATE INDEX "clients_agency_status_idx" ON "clients" USING btree ("agency_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "creative_metadata_ad_creative_uidx" ON "creative_metadata" USING btree ("ad_id","meta_creative_id");--> statement-breakpoint
CREATE INDEX "data_availability_lookup_idx" ON "data_availability" USING btree ("ad_account_id","entity_level","entity_key","metric_key","date_start","date_stop");--> statement-breakpoint
CREATE INDEX "email_delivery_report_time_idx" ON "email_delivery_logs" USING btree ("email_report_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "email_recipients_report_email_uidx" ON "email_recipients" USING btree ("email_report_id","email");--> statement-breakpoint
CREATE INDEX "email_reports_agency_enabled_idx" ON "email_reports" USING btree ("agency_id","enabled");--> statement-breakpoint
CREATE INDEX "email_reports_account_idx" ON "email_reports" USING btree ("ad_account_id");--> statement-breakpoint
CREATE INDEX "login_attempts_email_time_idx" ON "login_attempts" USING btree ("email_hash","created_at");--> statement-breakpoint
CREATE INDEX "login_attempts_ip_time_idx" ON "login_attempts" USING btree ("ip_hash","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "metric_daily_scope_uidx" ON "metric_daily" USING btree ("ad_account_id","entity_level","entity_key","date");--> statement-breakpoint
CREATE INDEX "metric_daily_account_date_idx" ON "metric_daily" USING btree ("ad_account_id","date");--> statement-breakpoint
CREATE INDEX "metric_daily_entity_date_idx" ON "metric_daily" USING btree ("entity_level","entity_key","date");--> statement-breakpoint
CREATE UNIQUE INDEX "metric_period_scope_uidx" ON "metric_period" USING btree ("ad_account_id","entity_level","entity_key","date_start","date_stop");--> statement-breakpoint
CREATE INDEX "metric_period_account_dates_idx" ON "metric_period" USING btree ("ad_account_id","date_start","date_stop");--> statement-breakpoint
CREATE INDEX "raw_ingestion_sync_idx" ON "raw_ingestion_records" USING btree ("sync_run_id");--> statement-breakpoint
CREATE INDEX "raw_ingestion_account_source_idx" ON "raw_ingestion_records" USING btree ("ad_account_id","source","source_object_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_uidx" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_expires_idx" ON "sessions" USING btree ("user_id","expires_at");--> statement-breakpoint
CREATE INDEX "sync_errors_run_idx" ON "sync_errors" USING btree ("sync_run_id");--> statement-breakpoint
CREATE INDEX "sync_errors_account_time_idx" ON "sync_errors" USING btree ("ad_account_id","occurred_at");--> statement-breakpoint
CREATE INDEX "sync_runs_account_status_idx" ON "sync_runs" USING btree ("ad_account_id","status");--> statement-breakpoint
CREATE INDEX "sync_runs_created_idx" ON "sync_runs" USING btree ("created_at");