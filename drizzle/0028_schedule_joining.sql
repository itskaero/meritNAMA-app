CREATE TABLE "induction_schedule" (
	"induction_id" integer NOT NULL,
	"step_id" integer NOT NULL,
	"sort_order" integer NOT NULL,
	"title" text NOT NULL,
	"detail" text,
	"status_id" integer,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "induction_schedule_induction_id_step_id_pk" PRIMARY KEY("induction_id","step_id")
);
--> statement-breakpoint
CREATE TABLE "joining_status" (
	"induction_id" integer NOT NULL,
	"applicant_id" text NOT NULL,
	"program" text NOT NULL,
	"quota" text,
	"speciality" text,
	"hospital" text,
	"status" text NOT NULL,
	"joined_on" date,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "joining_status_induction_id_applicant_id_program_pk" PRIMARY KEY("induction_id","applicant_id","program")
);
