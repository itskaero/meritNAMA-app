CREATE TABLE "round_room_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seq" bigserial NOT NULL,
	"induction" integer NOT NULL,
	"round_no" integer NOT NULL,
	"author_id" uuid,
	"kind" text DEFAULT 'message' NOT NULL,
	"body" text NOT NULL,
	"status" "discussion_status" DEFAULT 'visible' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "round_room_messages_kind" CHECK ("round_room_messages"."kind" in ('message', 'system')),
	CONSTRAINT "round_room_messages_body" CHECK (char_length("round_room_messages"."body") between 1 and 600)
);
--> statement-breakpoint
ALTER TABLE "discussion_reports" DROP CONSTRAINT "discussion_reports_kind";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "show_band" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "peer_counted" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "round_room_messages" ADD CONSTRAINT "round_room_messages_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "round_room_messages_seq_uq" ON "round_room_messages" USING btree ("seq");--> statement-breakpoint
CREATE INDEX "round_room_messages_room_idx" ON "round_room_messages" USING btree ("induction","round_no","seq");--> statement-breakpoint
CREATE INDEX "round_room_messages_author_idx" ON "round_room_messages" USING btree ("author_id","created_at");--> statement-breakpoint
ALTER TABLE "discussion_reports" ADD CONSTRAINT "discussion_reports_kind" CHECK ("discussion_reports"."target_kind" in ('thread', 'post', 'review', 'message'));