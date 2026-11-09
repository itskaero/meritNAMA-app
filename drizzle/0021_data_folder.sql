CREATE TABLE "data_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"path" text NOT NULL,
	"kind" text NOT NULL,
	"induction" integer,
	"round" integer,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"applied_sha256" text,
	"status" text NOT NULL,
	"summary" text,
	"message" text,
	"change_id" uuid,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"applied_at" timestamp with time zone,
	"applied_by" text,
	CONSTRAINT "data_files_path_unique" UNIQUE("path"),
	CONSTRAINT "data_files_status" CHECK ("data_files"."status" in ('new', 'replaces', 'live', 'held', 'problem', 'ignored', 'missing'))
);
--> statement-breakpoint
ALTER TABLE "data_files" ADD CONSTRAINT "data_files_change_id_staged_changes_id_fk" FOREIGN KEY ("change_id") REFERENCES "public"."staged_changes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "data_files_status_idx" ON "data_files" USING btree ("status");