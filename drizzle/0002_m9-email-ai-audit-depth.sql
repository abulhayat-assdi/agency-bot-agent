ALTER TABLE "ai_messages" ADD COLUMN "provider" varchar(40);--> statement-breakpoint
ALTER TABLE "ai_messages" ADD COLUMN "model" varchar(120);--> statement-breakpoint
ALTER TABLE "ai_messages" ADD COLUMN "usage_json" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "email_delivery_logs" ADD COLUMN "provider" varchar(20);--> statement-breakpoint
ALTER TABLE "email_delivery_logs" ADD COLUMN "attempt" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "email_reports" ADD COLUMN "next_run_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "email_reports" ADD COLUMN "last_run_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "email_reports" ADD COLUMN "last_status" varchar(40);