CREATE TYPE "public"."change_kind" AS ENUM('policy_activate', 'policy_file_import', 'seat_matrix_replace', 'merit_round_replace', 'merit_round_delete');--> statement-breakpoint
CREATE TYPE "public"."change_status" AS ENUM('pending', 'published', 'discarded', 'rolled_back');--> statement-breakpoint
CREATE TABLE "staged_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "change_kind" NOT NULL,
	"target" text NOT NULL,
	"title" text NOT NULL,
	"status" "change_status" DEFAULT 'pending' NOT NULL,
	"payload" json NOT NULL,
	"preview" json NOT NULL,
	"baseline" text NOT NULL,
	"snapshot" json,
	"reason" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"decision_reason" text
);
--> statement-breakpoint
CREATE INDEX "staged_changes_status_idx" ON "staged_changes" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "staged_changes_target_idx" ON "staged_changes" USING btree ("target","decided_at");