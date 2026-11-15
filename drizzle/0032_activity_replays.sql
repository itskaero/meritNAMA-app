CREATE TABLE "page_visits" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"session_hash" text,
	"path" text NOT NULL,
	"device" text NOT NULL,
	"ip_hmac" text,
	"net_hmac" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "replays" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"session_hash" text,
	"device" text NOT NULL,
	"net_hmac" text,
	"first_path" text NOT NULL,
	"file" text NOT NULL,
	"events" integer DEFAULT 0 NOT NULL,
	"bytes" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "page_visits" ADD CONSTRAINT "page_visits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "replays" ADD CONSTRAINT "replays_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "page_visits_user_idx" ON "page_visits" USING btree ("user_id","at");--> statement-breakpoint
CREATE INDEX "page_visits_at_idx" ON "page_visits" USING btree ("at");--> statement-breakpoint
CREATE INDEX "replays_user_idx" ON "replays" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE INDEX "replays_started_idx" ON "replays" USING btree ("started_at");