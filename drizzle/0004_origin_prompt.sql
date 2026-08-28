ALTER TABLE "essays" ADD COLUMN "origin_prompt_id" text;--> statement-breakpoint
ALTER TABLE "essays" ADD COLUMN "origin_prompt_title" text;--> statement-breakpoint
ALTER TABLE "essays" ADD COLUMN "origin_prompt_text" text;--> statement-breakpoint
ALTER TABLE "essays" ADD CONSTRAINT "essays_origin_prompt_id_prompts_id_fk" FOREIGN KEY ("origin_prompt_id") REFERENCES "public"."prompts"("id") ON DELETE set null ON UPDATE no action;