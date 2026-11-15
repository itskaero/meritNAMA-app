ALTER TYPE "public"."candidate_link_method" ADD VALUE 'cnic';--> statement-breakpoint
CREATE TABLE "candidate_privacy" (
	"applicant_id" text PRIMARY KEY NOT NULL,
	"hide_name" boolean DEFAULT false NOT NULL,
	"hide_pmdc" boolean DEFAULT false NOT NULL,
	"hide_record" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "candidate_identities" ADD COLUMN "cnic_hmac" text;