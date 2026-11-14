ALTER TYPE "public"."notification_kind" ADD VALUE 'access';--> statement-breakpoint
CREATE TABLE "access_vouchers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code_hash" text NOT NULL,
	"hint" text NOT NULL,
	"induction" integer,
	"note" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"used_by" text,
	"used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel" text NOT NULL,
	"tid" text NOT NULL,
	"amount_pkr" double precision NOT NULL,
	"paid_at" timestamp with time zone,
	"source" text NOT NULL,
	"matched_request_id" uuid,
	"imported_by" text NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "channel" text;--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "induction" integer;--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "auto_result" text;--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "reminded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_matched_request_id_access_requests_id_fk" FOREIGN KEY ("matched_request_id") REFERENCES "public"."access_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "access_vouchers_code_uq" ON "access_vouchers" USING btree ("code_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_tid_uq" ON "payments" USING btree ("tid");