ALTER TYPE "public"."change_kind" ADD VALUE 'candidate_correction';--> statement-breakpoint
CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" json NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candidate_corrections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"induction_id" integer NOT NULL,
	"applicant_id" text NOT NULL,
	"field" text NOT NULL,
	"program" text,
	"value" double precision NOT NULL,
	"reason" text NOT NULL,
	"change_id" uuid,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_by" text,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "candidate_corrections_field" CHECK ("candidate_corrections"."field" in ('base_marks', 'program_marks', 'profile_status'))
);
--> statement-breakpoint
ALTER TABLE "candidate_corrections" ADD CONSTRAINT "candidate_corrections_change_id_staged_changes_id_fk" FOREIGN KEY ("change_id") REFERENCES "public"."staged_changes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "candidate_corrections_candidate_idx" ON "candidate_corrections" USING btree ("induction_id","applicant_id");