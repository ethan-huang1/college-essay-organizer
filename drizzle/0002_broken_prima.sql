ALTER TABLE "prompts" ADD COLUMN "shared_application_key" text;--> statement-breakpoint
ALTER TABLE "prompts" ADD COLUMN "canonical_key" text;--> statement-breakpoint
ALTER TABLE "prompts" ADD COLUMN "group_key" text;--> statement-breakpoint
ALTER TABLE "prompts" ADD COLUMN "group_label" text;--> statement-breakpoint
ALTER TABLE "prompts" ADD COLUMN "group_required_count" integer;--> statement-breakpoint
ALTER TABLE "prompts" ADD COLUMN "program_key" text;--> statement-breakpoint
ALTER TABLE "prompts" ADD COLUMN "program_label" text;--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "catalogue_status" text;--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "selected_programs" jsonb;--> statement-breakpoint
CREATE INDEX "prompts_canonical_idx" ON "prompts" USING btree ("workspace_id","canonical_key");--> statement-breakpoint
CREATE INDEX "prompts_group_idx" ON "prompts" USING btree ("school_id","group_key");--> statement-breakpoint
ALTER TABLE "prompts" ADD CONSTRAINT "prompts_group_required_count_positive_check" CHECK ("prompts"."group_required_count" is null or "prompts"."group_required_count" >= 1);