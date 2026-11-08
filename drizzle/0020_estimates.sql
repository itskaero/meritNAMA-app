ALTER TABLE "simulation_runs" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "simulation_runs" ADD COLUMN "published_by" text;