ALTER TABLE "merit_allocations" ADD COLUMN "name" text;--> statement-breakpoint
ALTER TABLE "merit_allocations" ADD COLUMN "pmdc_no" text;--> statement-breakpoint
CREATE INDEX "merit_allocations_applicant_idx" ON "merit_allocations" USING btree ("applicant_id");--> statement-breakpoint
CREATE INDEX "merit_allocations_pmdc_idx" ON "merit_allocations" USING btree ("pmdc_no");