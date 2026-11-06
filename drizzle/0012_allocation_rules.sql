ALTER TYPE "public"."change_kind" ADD VALUE 'rules_activate';--> statement-breakpoint
CREATE TABLE "allocation_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"induction_id" integer NOT NULL,
	"version" integer NOT NULL,
	"status" "policy_status" DEFAULT 'draft' NOT NULL,
	"definition" json NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"activated_at" timestamp with time zone,
	CONSTRAINT "allocation_rules_version_positive" CHECK ("allocation_rules"."version" > 0),
	CONSTRAINT "allocation_rules_induction_positive" CHECK ("allocation_rules"."induction_id" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "allocation_rules_induction_version_uq" ON "allocation_rules" USING btree ("induction_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "allocation_rules_single_active_uq" ON "allocation_rules" USING btree ("induction_id") WHERE "allocation_rules"."status" = 'active';