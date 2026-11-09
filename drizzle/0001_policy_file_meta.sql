CREATE TABLE "scoring_policy_file_meta" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"meta" json NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scoring_policies" ALTER COLUMN "definition" SET DATA TYPE json;