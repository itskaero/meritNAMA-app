CREATE TYPE "public"."reference_document_kind" AS ENUM('disciplines', 'specialty_groups', 'cpsp_accreditation');--> statement-breakpoint
CREATE TABLE "hospitals" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "induction_seats" (
	"induction_id" integer NOT NULL,
	"program_id" integer NOT NULL,
	"quota_id" integer NOT NULL,
	"speciality_id" integer NOT NULL,
	"institute_id" integer NOT NULL,
	"hospital_id" integer NOT NULL,
	"seats" integer NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "induction_seats_induction_id_program_id_quota_id_speciality_id_institute_id_hospital_id_pk" PRIMARY KEY("induction_id","program_id","quota_id","speciality_id","institute_id","hospital_id"),
	CONSTRAINT "induction_seats_seats_nonnegative" CHECK ("induction_seats"."seats" >= 0)
);
--> statement-breakpoint
CREATE TABLE "institutes" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "programs" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotas" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reference_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "reference_document_kind" NOT NULL,
	"induction_id" integer DEFAULT 0 NOT NULL,
	"version" integer NOT NULL,
	"data" json NOT NULL,
	"summary" text NOT NULL,
	"created_by" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reference_documents_version_positive" CHECK ("reference_documents"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "specialities" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "induction_seats" ADD CONSTRAINT "induction_seats_induction_id_inductions_id_fk" FOREIGN KEY ("induction_id") REFERENCES "public"."inductions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "induction_seats" ADD CONSTRAINT "induction_seats_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "induction_seats" ADD CONSTRAINT "induction_seats_quota_id_quotas_id_fk" FOREIGN KEY ("quota_id") REFERENCES "public"."quotas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "induction_seats" ADD CONSTRAINT "induction_seats_speciality_id_specialities_id_fk" FOREIGN KEY ("speciality_id") REFERENCES "public"."specialities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "induction_seats" ADD CONSTRAINT "induction_seats_institute_id_institutes_id_fk" FOREIGN KEY ("institute_id") REFERENCES "public"."institutes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "induction_seats" ADD CONSTRAINT "induction_seats_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "induction_seats_position_idx" ON "induction_seats" USING btree ("induction_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "reference_documents_kind_induction_version_uq" ON "reference_documents" USING btree ("kind","induction_id","version");