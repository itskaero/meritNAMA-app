CREATE TYPE "public"."simulation_run_status" AS ENUM('queued', 'running', 'done', 'failed');--> statement-breakpoint
CREATE TABLE "sim_candidates" (
	"induction_id" integer NOT NULL,
	"applicant_id" text NOT NULL,
	"base_marks" double precision NOT NULL,
	"program_marks" json NOT NULL,
	"applied_in" json NOT NULL,
	"certificates" json NOT NULL,
	"profile_status" integer,
	CONSTRAINT "sim_candidates_induction_id_applicant_id_pk" PRIMARY KEY("induction_id","applicant_id")
);
--> statement-breakpoint
CREATE TABLE "sim_datasets" (
	"induction_id" integer PRIMARY KEY NOT NULL,
	"summary" json NOT NULL,
	"sources" json NOT NULL,
	"imported_by" text NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sim_preferences" (
	"induction_id" integer NOT NULL,
	"applicant_id" text NOT NULL,
	"program" text NOT NULL,
	"preference_no" integer NOT NULL,
	"quota" text NOT NULL,
	"speciality_id" integer NOT NULL,
	"hospital" text NOT NULL,
	"type_id" integer,
	"discipline_ids" integer[] NOT NULL,
	"program_marks" double precision,
	"parent_marks" double precision
);
--> statement-breakpoint
CREATE TABLE "simulation_placements" (
	"run_id" uuid NOT NULL,
	"applicant_id" text NOT NULL,
	"program" text NOT NULL,
	"quota" text NOT NULL,
	"speciality" text NOT NULL,
	"hospital" text NOT NULL,
	"preference_no" integer NOT NULL,
	"mark" double precision NOT NULL,
	"track" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "simulation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"induction_id" integer NOT NULL,
	"status" "simulation_run_status" DEFAULT 'queued' NOT NULL,
	"rules_origin" text NOT NULL,
	"rules" json NOT NULL,
	"policy" text,
	"dataset_imported_at" timestamp with time zone NOT NULL,
	"summary" json,
	"error" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "sim_candidates" ADD CONSTRAINT "sim_candidates_induction_id_sim_datasets_induction_id_fk" FOREIGN KEY ("induction_id") REFERENCES "public"."sim_datasets"("induction_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sim_preferences" ADD CONSTRAINT "sim_preferences_induction_id_applicant_id_sim_candidates_induction_id_applicant_id_fk" FOREIGN KEY ("induction_id","applicant_id") REFERENCES "public"."sim_candidates"("induction_id","applicant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simulation_placements" ADD CONSTRAINT "simulation_placements_run_id_simulation_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."simulation_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sim_preferences_candidate_idx" ON "sim_preferences" USING btree ("induction_id","applicant_id");--> statement-breakpoint
CREATE INDEX "simulation_placements_run_idx" ON "simulation_placements" USING btree ("run_id","program","quota","speciality");--> statement-breakpoint
CREATE INDEX "simulation_runs_induction_idx" ON "simulation_runs" USING btree ("induction_id","created_at");