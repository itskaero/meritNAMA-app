CREATE TYPE "public"."discussion_status" AS ENUM('visible', 'hidden');--> statement-breakpoint
CREATE TYPE "public"."discussion_topic_kind" AS ENUM('general', 'induction', 'round', 'speciality', 'hospital');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('open', 'resolved', 'dismissed');--> statement-breakpoint
CREATE TABLE "discussion_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"body" text NOT NULL,
	"status" "discussion_status" DEFAULT 'visible' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discussion_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_kind" text NOT NULL,
	"target_id" uuid NOT NULL,
	"reporter_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"status" "report_status" DEFAULT 'open' NOT NULL,
	"resolved_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discussion_reports_kind" CHECK ("discussion_reports"."target_kind" in ('thread', 'post'))
);
--> statement-breakpoint
CREATE TABLE "discussion_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_kind" "discussion_topic_kind" NOT NULL,
	"topic_key" text DEFAULT '' NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"author_id" uuid NOT NULL,
	"status" "discussion_status" DEFAULT 'visible' NOT NULL,
	"locked" boolean DEFAULT false NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"reply_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discussion_votes" (
	"target_kind" text NOT NULL,
	"target_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discussion_votes_target_kind_target_id_user_id_pk" PRIMARY KEY("target_kind","target_id","user_id"),
	CONSTRAINT "discussion_votes_kind" CHECK ("discussion_votes"."target_kind" in ('thread', 'post'))
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "display_name" text;--> statement-breakpoint
ALTER TABLE "discussion_posts" ADD CONSTRAINT "discussion_posts_thread_id_discussion_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."discussion_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discussion_posts" ADD CONSTRAINT "discussion_posts_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discussion_reports" ADD CONSTRAINT "discussion_reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discussion_threads" ADD CONSTRAINT "discussion_threads_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discussion_votes" ADD CONSTRAINT "discussion_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "discussion_posts_thread_idx" ON "discussion_posts" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "discussion_posts_author_idx" ON "discussion_posts" USING btree ("author_id","created_at");--> statement-breakpoint
CREATE INDEX "discussion_reports_status_idx" ON "discussion_reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "discussion_reports_once_uq" ON "discussion_reports" USING btree ("target_kind","target_id","reporter_id");--> statement-breakpoint
CREATE INDEX "discussion_threads_topic_idx" ON "discussion_threads" USING btree ("topic_kind","topic_key","last_activity_at");--> statement-breakpoint
CREATE INDEX "discussion_threads_activity_idx" ON "discussion_threads" USING btree ("last_activity_at");