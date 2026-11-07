CREATE TABLE "sim_consent_scenarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"induction_id" integer NOT NULL,
	"base_key" text NOT NULL,
	"overrides" json NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "simulation_runs" ADD COLUMN "base_run_id" uuid;--> statement-breakpoint
ALTER TABLE "simulation_runs" ADD COLUMN "owner_user_id" uuid;--> statement-breakpoint
ALTER TABLE "simulation_runs" ADD COLUMN "consent_overrides" json;--> statement-breakpoint
ALTER TABLE "simulation_runs" ADD COLUMN "carry" json;--> statement-breakpoint
ALTER TABLE "sim_consent_scenarios" ADD CONSTRAINT "sim_consent_scenarios_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sim_consent_scenarios_uq" ON "sim_consent_scenarios" USING btree ("user_id","induction_id","base_key");--> statement-breakpoint
ALTER TABLE "simulation_runs" ADD CONSTRAINT "simulation_runs_base_run_id_simulation_runs_id_fk" FOREIGN KEY ("base_run_id") REFERENCES "public"."simulation_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simulation_runs" ADD CONSTRAINT "simulation_runs_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;