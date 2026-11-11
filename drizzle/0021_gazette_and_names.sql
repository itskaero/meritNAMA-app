CREATE TABLE "gazette_entries" (
	"induction_id" integer NOT NULL,
	"applicant_id" text NOT NULL,
	"position" integer NOT NULL,
	"candidate_name" text,
	"marks_total" double precision NOT NULL,
	"status" text,
	"parts" json DEFAULT '{}'::json NOT NULL,
	CONSTRAINT "gazette_entries_induction_id_applicant_id_pk" PRIMARY KEY("induction_id","applicant_id")
);
--> statement-breakpoint
CREATE TABLE "gazettes" (
	"induction_id" integer PRIMARY KEY NOT NULL,
	"entries" integer NOT NULL,
	"source" json NOT NULL,
	"imported_by" text NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "merit_allocations" ADD COLUMN "candidate_name" text;--> statement-breakpoint
ALTER TABLE "gazette_entries" ADD CONSTRAINT "gazette_entries_induction_id_gazettes_induction_id_fk" FOREIGN KEY ("induction_id") REFERENCES "public"."gazettes"("induction_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gazette_entries_marks_idx" ON "gazette_entries" USING btree ("induction_id","marks_total");