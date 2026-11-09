CREATE TYPE "public"."simulation_run_kind" AS ENUM('first_round', 'next_round');--> statement-breakpoint
CREATE TABLE "sim_consent" (
	"induction_id" integer NOT NULL,
	"round_no" integer NOT NULL,
	"applicant_id" text NOT NULL,
	"status" text NOT NULL,
	"program" text NOT NULL,
	"quota" text NOT NULL,
	"preference_no" integer NOT NULL,
	"speciality" text,
	"hospital" text
);
--> statement-breakpoint
ALTER TABLE "simulation_runs" ADD COLUMN "kind" "simulation_run_kind" DEFAULT 'first_round' NOT NULL;--> statement-breakpoint
ALTER TABLE "simulation_runs" ADD COLUMN "from_round" integer;--> statement-breakpoint
ALTER TABLE "sim_consent" ADD CONSTRAINT "sim_consent_induction_id_sim_datasets_induction_id_fk" FOREIGN KEY ("induction_id") REFERENCES "public"."sim_datasets"("induction_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sim_consent_round_idx" ON "sim_consent" USING btree ("induction_id","round_no");