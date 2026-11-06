CREATE TABLE "preference_items" (
	"list_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"speciality" text NOT NULL,
	"hospital" text NOT NULL,
	"note" text,
	CONSTRAINT "preference_items_list_id_speciality_hospital_pk" PRIMARY KEY("list_id","speciality","hospital"),
	CONSTRAINT "preference_items_position_positive" CHECK ("preference_items"."position" > 0)
);
--> statement-breakpoint
CREATE TABLE "preference_lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"program" text NOT NULL,
	"quota" text NOT NULL,
	"marks" double precision,
	"total" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "preference_items" ADD CONSTRAINT "preference_items_list_id_preference_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."preference_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preference_lists" ADD CONSTRAINT "preference_lists_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "preference_items_position_uq" ON "preference_items" USING btree ("list_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "preference_lists_name_uq" ON "preference_lists" USING btree ("user_id",lower("name"));--> statement-breakpoint
CREATE INDEX "preference_lists_user_idx" ON "preference_lists" USING btree ("user_id","updated_at");