ALTER TABLE "candidate_corrections" ADD COLUMN "kind" text DEFAULT 'admin' NOT NULL;--> statement-breakpoint
ALTER TABLE "sim_candidates" ADD COLUMN "verification" json DEFAULT '[]'::json NOT NULL;--> statement-breakpoint
ALTER TABLE "sim_candidates" ADD COLUMN "name" text;--> statement-breakpoint
ALTER TABLE "sim_candidates" ADD COLUMN "pmdc_no" text;--> statement-breakpoint
ALTER TABLE "candidate_corrections" ADD CONSTRAINT "candidate_corrections_kind" CHECK ("candidate_corrections"."kind" in ('grievance', 'amendment', 'admin'));