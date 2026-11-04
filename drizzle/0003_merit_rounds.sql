CREATE TYPE "public"."name_alias_kind" AS ENUM('speciality', 'hospital');--> statement-breakpoint
CREATE TABLE "merit_allocations" (
	"round_id" integer NOT NULL,
	"row_no" integer NOT NULL,
	"applicant_id" text NOT NULL,
	"program" text NOT NULL,
	"quota" text NOT NULL,
	"speciality_job_id" integer NOT NULL,
	"speciality" text NOT NULL,
	"speciality_id" integer,
	"hospital" text NOT NULL,
	"hospital_id" integer,
	"institute" text NOT NULL,
	"seats" integer NOT NULL,
	"marks" double precision NOT NULL,
	"preference_no" integer NOT NULL,
	"consent" text NOT NULL,
	CONSTRAINT "merit_allocations_round_id_row_no_pk" PRIMARY KEY("round_id","row_no")
);
--> statement-breakpoint
CREATE TABLE "merit_rounds" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "merit_rounds_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"induction_id" integer NOT NULL,
	"round_no" integer NOT NULL,
	"cycle_code" text NOT NULL,
	"cycle_name" text NOT NULL,
	"starts_on" date,
	"ends_on" date,
	"allocations" integer NOT NULL,
	"imported_by" text NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "merit_rounds_round_positive" CHECK ("merit_rounds"."round_no" > 0)
);
--> statement-breakpoint
CREATE TABLE "name_aliases" (
	"kind" "name_alias_kind" NOT NULL,
	"name_key" text NOT NULL,
	"lookup_id" integer NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "name_aliases_kind_name_key_pk" PRIMARY KEY("kind","name_key")
);
--> statement-breakpoint
ALTER TABLE "merit_allocations" ADD CONSTRAINT "merit_allocations_round_id_merit_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."merit_rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merit_allocations" ADD CONSTRAINT "merit_allocations_speciality_id_specialities_id_fk" FOREIGN KEY ("speciality_id") REFERENCES "public"."specialities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merit_allocations" ADD CONSTRAINT "merit_allocations_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merit_rounds" ADD CONSTRAINT "merit_rounds_induction_id_inductions_id_fk" FOREIGN KEY ("induction_id") REFERENCES "public"."inductions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "merit_allocations_speciality_idx" ON "merit_allocations" USING btree ("speciality_id");--> statement-breakpoint
CREATE INDEX "merit_allocations_hospital_idx" ON "merit_allocations" USING btree ("hospital_id");--> statement-breakpoint
CREATE INDEX "merit_allocations_round_group_idx" ON "merit_allocations" USING btree ("round_id","program","quota","speciality");--> statement-breakpoint
CREATE UNIQUE INDEX "merit_rounds_induction_round_uq" ON "merit_rounds" USING btree ("induction_id","round_no");