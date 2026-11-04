CREATE TABLE "shortlist_items" (
	"user_id" uuid NOT NULL,
	"program" text NOT NULL,
	"quota" text NOT NULL,
	"speciality" text NOT NULL,
	"hospital" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shortlist_items_user_id_program_quota_speciality_hospital_pk" PRIMARY KEY("user_id","program","quota","speciality","hospital")
);
--> statement-breakpoint
ALTER TABLE "shortlist_items" ADD CONSTRAINT "shortlist_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;