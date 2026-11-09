CREATE TYPE "public"."candidate_link_method" AS ENUM('email', 'manual');--> statement-breakpoint
CREATE TYPE "public"."candidate_link_status" AS ENUM('pending', 'verified', 'rejected');--> statement-breakpoint
CREATE TABLE "candidate_identities" (
	"applicant_id" text PRIMARY KEY NOT NULL,
	"email_hmac" text,
	"pmdc_hmac" text,
	"last_induction" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candidate_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"applicant_id" text NOT NULL,
	"status" "candidate_link_status" NOT NULL,
	"method" "candidate_link_method" NOT NULL,
	"evidence_file" text,
	"evidence_type" text,
	"pmdc_matches" boolean,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dev_outbox" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"to" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_tokens" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"email" text NOT NULL,
	"ip_hash" text,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "login_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id_hash" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "candidate_links" ADD CONSTRAINT "candidate_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "candidate_identities_email_idx" ON "candidate_identities" USING btree ("email_hmac");--> statement-breakpoint
CREATE UNIQUE INDEX "candidate_links_verified_user_uq" ON "candidate_links" USING btree ("user_id") WHERE status = 'verified';--> statement-breakpoint
CREATE UNIQUE INDEX "candidate_links_verified_applicant_uq" ON "candidate_links" USING btree ("applicant_id") WHERE status = 'verified';--> statement-breakpoint
CREATE UNIQUE INDEX "candidate_links_pending_user_uq" ON "candidate_links" USING btree ("user_id") WHERE status = 'pending';--> statement-breakpoint
CREATE INDEX "candidate_links_status_idx" ON "candidate_links" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "login_tokens_email_idx" ON "login_tokens" USING btree ("email","created_at");--> statement-breakpoint
CREATE INDEX "login_tokens_ip_idx" ON "login_tokens" USING btree ("ip_hash","created_at");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");