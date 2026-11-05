CREATE TYPE "public"."follow_kind" AS ENUM('induction', 'round', 'speciality', 'hospital', 'thread');--> statement-breakpoint
CREATE TYPE "public"."notification_kind" AS ENUM('answer', 'accepted', 'new_thread', 'new_round');--> statement-breakpoint
CREATE TABLE "follows" (
	"user_id" uuid NOT NULL,
	"kind" "follow_kind" NOT NULL,
	"key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "follows_user_id_kind_key_pk" PRIMARY KEY("user_id","kind","key")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "notification_kind" NOT NULL,
	"title" text NOT NULL,
	"href" text NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "discussion_posts" ADD COLUMN "snippet" json;--> statement-breakpoint
ALTER TABLE "discussion_threads" ADD COLUMN "accepted_post_id" uuid;--> statement-breakpoint
ALTER TABLE "discussion_threads" ADD COLUMN "answered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "discussion_threads" ADD COLUMN "duplicate_of" uuid;--> statement-breakpoint
ALTER TABLE "discussion_threads" ADD COLUMN "snippet" json;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "follows_target_idx" ON "follows" USING btree ("kind","key");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","read_at","created_at");--> statement-breakpoint
ALTER TABLE "discussion_threads" ADD CONSTRAINT "discussion_threads_accepted_post_id_discussion_posts_id_fk" FOREIGN KEY ("accepted_post_id") REFERENCES "public"."discussion_posts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discussion_threads" ADD CONSTRAINT "discussion_threads_duplicate_of_discussion_threads_id_fk" FOREIGN KEY ("duplicate_of") REFERENCES "public"."discussion_threads"("id") ON DELETE set null ON UPDATE no action;