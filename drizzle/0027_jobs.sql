ALTER TYPE "public"."notification_kind" ADD VALUE 'new_job';--> statement-breakpoint
CREATE TABLE "job_saves" (
	"user_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_saves_user_id_job_id_pk" PRIMARY KEY("user_id","job_id")
);
--> statement-breakpoint
CREATE TABLE "job_sources" (
	"source" text PRIMARY KEY NOT NULL,
	"last_run" timestamp with time zone,
	"last_ok" timestamp with time zone,
	"last_error" text,
	"found" integer DEFAULT 0 NOT NULL,
	"kept" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"source_id" text NOT NULL,
	"title" text NOT NULL,
	"employer" text,
	"city" text,
	"posted_on" date,
	"last_date" date,
	"link" text NOT NULL,
	"official" boolean DEFAULT false NOT NULL,
	"education" json DEFAULT '[]'::json NOT NULL,
	"vacancies" json DEFAULT '[]'::json NOT NULL,
	"apply_online" boolean,
	"ad_no" text,
	"folder" text NOT NULL,
	"post_type" text NOT NULL,
	"hospital_id" integer,
	"hidden" boolean DEFAULT false NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"first_seen" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "job_saves" ADD CONSTRAINT "job_saves_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_saves" ADD CONSTRAINT "job_saves_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_source_uq" ON "jobs" USING btree ("source","source_id");--> statement-breakpoint
CREATE INDEX "jobs_last_date_idx" ON "jobs" USING btree ("last_date");--> statement-breakpoint
CREATE INDEX "jobs_folder_idx" ON "jobs" USING btree ("folder");