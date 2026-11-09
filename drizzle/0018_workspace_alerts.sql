ALTER TYPE "public"."notification_kind" ADD VALUE 'shortlist';--> statement-breakpoint
CREATE TABLE "saved_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"label" text NOT NULL,
	"href" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "shortlist_alerts" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "saved_views_user_href_uq" ON "saved_views" USING btree ("user_id","href");--> statement-breakpoint
CREATE INDEX "saved_views_user_idx" ON "saved_views" USING btree ("user_id","created_at");