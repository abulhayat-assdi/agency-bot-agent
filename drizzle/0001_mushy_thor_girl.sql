ALTER TABLE "sessions" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "sessions" CASCADE;--> statement-breakpoint
ALTER TABLE "breakdown_metric_daily" ALTER COLUMN "impressions" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "breakdown_metric_daily" ALTER COLUMN "reach" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "breakdown_metric_daily" ALTER COLUMN "clicks" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "breakdown_metric_daily" ALTER COLUMN "link_clicks" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "breakdown_metric_daily" ALTER COLUMN "outbound_clicks" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "metric_daily" ALTER COLUMN "impressions" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "metric_daily" ALTER COLUMN "reach" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "metric_daily" ALTER COLUMN "clicks" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "metric_daily" ALTER COLUMN "link_clicks" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "metric_daily" ALTER COLUMN "outbound_clicks" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "metric_period" ALTER COLUMN "impressions" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "metric_period" ALTER COLUMN "reach" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "metric_period" ALTER COLUMN "clicks" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "metric_period" ALTER COLUMN "link_clicks" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "metric_period" ALTER COLUMN "outbound_clicks" SET DATA TYPE bigint;