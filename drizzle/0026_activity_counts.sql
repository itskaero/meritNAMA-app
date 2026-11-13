CREATE TABLE "activity_pings" (
	"key" text NOT NULL,
	"user_id" uuid NOT NULL,
	"seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_pings_key_user_id_pk" PRIMARY KEY("key","user_id")
);
--> statement-breakpoint
CREATE TABLE "search_counts" (
	"key" text NOT NULL,
	"label" text NOT NULL,
	"hour" timestamp with time zone NOT NULL,
	"n" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "search_counts_key_hour_pk" PRIMARY KEY("key","hour")
);
--> statement-breakpoint
ALTER TABLE "activity_pings" ADD CONSTRAINT "activity_pings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_pings_seen_idx" ON "activity_pings" USING btree ("key","seen_at");--> statement-breakpoint
CREATE INDEX "search_counts_hour_idx" ON "search_counts" USING btree ("hour");