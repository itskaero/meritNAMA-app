ALTER TYPE "public"."notification_kind" ADD VALUE 'new_review';--> statement-breakpoint
CREATE TABLE "discussion_poll_options" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "discussion_poll_options_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"thread_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"label" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discussion_poll_votes" (
	"thread_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"option_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discussion_poll_votes_thread_id_user_id_pk" PRIMARY KEY("thread_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "discussion_polls" (
	"thread_id" uuid PRIMARY KEY NOT NULL,
	"question" text NOT NULL,
	"closes_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hospital_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hospital_id" integer NOT NULL,
	"speciality_id" integer,
	"author_id" uuid NOT NULL,
	"induction" integer NOT NULL,
	"training" integer NOT NULL,
	"workload" integer NOT NULL,
	"hostel" integer NOT NULL,
	"stipend" integer NOT NULL,
	"body" text NOT NULL,
	"status" "discussion_status" DEFAULT 'visible' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hospital_reviews_ratings" CHECK ("hospital_reviews"."training" between 1 and 5 and "hospital_reviews"."workload" between 1 and 5 and "hospital_reviews"."hostel" between 1 and 5 and "hospital_reviews"."stipend" between 1 and 5)
);
--> statement-breakpoint
ALTER TABLE "discussion_reports" DROP CONSTRAINT "discussion_reports_kind";--> statement-breakpoint
ALTER TABLE "discussion_votes" DROP CONSTRAINT "discussion_votes_kind";--> statement-breakpoint
ALTER TABLE "discussion_poll_options" ADD CONSTRAINT "discussion_poll_options_thread_id_discussion_polls_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."discussion_polls"("thread_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discussion_poll_votes" ADD CONSTRAINT "discussion_poll_votes_thread_id_discussion_polls_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."discussion_polls"("thread_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discussion_poll_votes" ADD CONSTRAINT "discussion_poll_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discussion_poll_votes" ADD CONSTRAINT "discussion_poll_votes_option_id_discussion_poll_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."discussion_poll_options"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discussion_polls" ADD CONSTRAINT "discussion_polls_thread_id_discussion_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."discussion_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hospital_reviews" ADD CONSTRAINT "hospital_reviews_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hospital_reviews" ADD CONSTRAINT "hospital_reviews_speciality_id_specialities_id_fk" FOREIGN KEY ("speciality_id") REFERENCES "public"."specialities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hospital_reviews" ADD CONSTRAINT "hospital_reviews_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "discussion_poll_options_pos_uq" ON "discussion_poll_options" USING btree ("thread_id","position");--> statement-breakpoint
CREATE INDEX "discussion_poll_votes_option_idx" ON "discussion_poll_votes" USING btree ("option_id");--> statement-breakpoint
CREATE UNIQUE INDEX "hospital_reviews_author_uq" ON "hospital_reviews" USING btree ("author_id","hospital_id",coalesce("speciality_id", 0));--> statement-breakpoint
CREATE INDEX "hospital_reviews_hospital_idx" ON "hospital_reviews" USING btree ("hospital_id","status");--> statement-breakpoint
CREATE INDEX "hospital_reviews_speciality_idx" ON "hospital_reviews" USING btree ("speciality_id","status");--> statement-breakpoint
ALTER TABLE "discussion_reports" ADD CONSTRAINT "discussion_reports_kind" CHECK ("discussion_reports"."target_kind" in ('thread', 'post', 'review'));--> statement-breakpoint
ALTER TABLE "discussion_votes" ADD CONSTRAINT "discussion_votes_kind" CHECK ("discussion_votes"."target_kind" in ('thread', 'post', 'review'));