CREATE TABLE "application_cycles" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"label" text NOT NULL,
	"start_year" integer NOT NULL,
	"end_year" integer NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cycles_year_order_check" CHECK ("application_cycles"."end_year" >= "application_cycles"."start_year")
);
--> statement-breakpoint
CREATE TABLE "assigned_essay_responses" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"prompt_id" text NOT NULL,
	"essay_id" text NOT NULL,
	"essay_version_id" text,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "essay_family_links" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"essay_id" text NOT NULL,
	"family_id" text NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"source" text DEFAULT 'deterministic' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "essay_prompt_matches" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"essay_id" text NOT NULL,
	"prompt_id" text NOT NULL,
	"score" integer NOT NULL,
	"matched_themes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"missing_requirements" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"word_count_difference" integer DEFAULT 0 NOT NULL,
	"school_specificity_risk" text DEFAULT 'low' NOT NULL,
	"recommended_action" text NOT NULL,
	"explanation" text NOT NULL,
	"calculated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "essay_prompt_score_range_check" CHECK ("essay_prompt_matches"."score" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "essay_tag_links" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"essay_id" text NOT NULL,
	"tag_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "essay_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"essay_id" text NOT NULL,
	"version_number" integer NOT NULL,
	"content" text NOT NULL,
	"word_count" integer NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "essay_version_positive_check" CHECK ("essay_versions"."version_number" > 0),
	CONSTRAINT "essay_version_words_nonnegative_check" CHECK ("essay_versions"."word_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "essays" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"title" text NOT NULL,
	"current_content" text DEFAULT '' NOT NULL,
	"target_word_count" integer,
	"status" text DEFAULT 'idea' NOT NULL,
	"designation" text DEFAULT 'canonical' NOT NULL,
	"adapted_from_essay_id" text,
	"notes" text,
	"school_specific_phrases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_edited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "essays_target_words_nonnegative_check" CHECK ("essays"."target_word_count" is null or "essays"."target_word_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "prompt_change_log" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"prompt_id" text NOT NULL,
	"previous_prompt_text" text NOT NULL,
	"previous_min_word_count" integer,
	"previous_max_word_count" integer,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prompt_families" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"color" text NOT NULL,
	"sort_order" integer NOT NULL,
	"is_editable" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prompt_family_links" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"prompt_id" text NOT NULL,
	"family_id" text NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"source" text DEFAULT 'deterministic' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prompt_tag_links" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"prompt_id" text NOT NULL,
	"tag_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prompt_tags" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prompts" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"school_id" text NOT NULL,
	"cycle_id" text,
	"title" text NOT NULL,
	"prompt_text" text NOT NULL,
	"min_word_count" integer,
	"max_word_count" integer,
	"min_char_count" integer,
	"max_char_count" integer,
	"requirement" text DEFAULT 'required' NOT NULL,
	"conditional_note" text,
	"deadline" timestamp with time zone,
	"status" text DEFAULT 'not-started' NOT NULL,
	"classification_confidence" integer DEFAULT 0 NOT NULL,
	"classification_source" text DEFAULT 'deterministic' NOT NULL,
	"verification_status" text DEFAULT 'manual' NOT NULL,
	"application_platform" text DEFAULT 'unknown' NOT NULL,
	"source_url" text,
	"retrieved_at" timestamp with time zone,
	"external_ref" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prompts_word_count_nonnegative_check" CHECK (coalesce("prompts"."min_word_count", 0) >= 0 and coalesce("prompts"."max_word_count", 0) >= 0),
	CONSTRAINT "prompts_word_count_order_check" CHECK ("prompts"."min_word_count" is null or "prompts"."max_word_count" is null or "prompts"."max_word_count" >= "prompts"."min_word_count"),
	CONSTRAINT "prompts_char_count_nonnegative_check" CHECK (coalesce("prompts"."min_char_count", 0) >= 0 and coalesce("prompts"."max_char_count", 0) >= 0),
	CONSTRAINT "prompts_char_count_order_check" CHECK ("prompts"."min_char_count" is null or "prompts"."max_char_count" is null or "prompts"."max_char_count" >= "prompts"."min_char_count"),
	CONSTRAINT "prompts_confidence_range_check" CHECK ("prompts"."classification_confidence" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "schools" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"cycle_id" text,
	"name" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "application_cycles" ADD CONSTRAINT "application_cycles_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assigned_essay_responses" ADD CONSTRAINT "assigned_essay_responses_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assigned_essay_responses" ADD CONSTRAINT "assigned_essay_responses_prompt_id_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."prompts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assigned_essay_responses" ADD CONSTRAINT "assigned_essay_responses_essay_id_essays_id_fk" FOREIGN KEY ("essay_id") REFERENCES "public"."essays"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assigned_essay_responses" ADD CONSTRAINT "assigned_essay_responses_essay_version_id_essay_versions_id_fk" FOREIGN KEY ("essay_version_id") REFERENCES "public"."essay_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "essay_family_links" ADD CONSTRAINT "essay_family_links_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "essay_family_links" ADD CONSTRAINT "essay_family_links_essay_id_essays_id_fk" FOREIGN KEY ("essay_id") REFERENCES "public"."essays"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "essay_family_links" ADD CONSTRAINT "essay_family_links_family_id_prompt_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."prompt_families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "essay_prompt_matches" ADD CONSTRAINT "essay_prompt_matches_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "essay_prompt_matches" ADD CONSTRAINT "essay_prompt_matches_essay_id_essays_id_fk" FOREIGN KEY ("essay_id") REFERENCES "public"."essays"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "essay_prompt_matches" ADD CONSTRAINT "essay_prompt_matches_prompt_id_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."prompts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "essay_tag_links" ADD CONSTRAINT "essay_tag_links_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "essay_tag_links" ADD CONSTRAINT "essay_tag_links_essay_id_essays_id_fk" FOREIGN KEY ("essay_id") REFERENCES "public"."essays"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "essay_tag_links" ADD CONSTRAINT "essay_tag_links_tag_id_prompt_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."prompt_tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "essay_versions" ADD CONSTRAINT "essay_versions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "essay_versions" ADD CONSTRAINT "essay_versions_essay_id_essays_id_fk" FOREIGN KEY ("essay_id") REFERENCES "public"."essays"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "essays" ADD CONSTRAINT "essays_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "essays" ADD CONSTRAINT "essays_adapted_from_fk" FOREIGN KEY ("adapted_from_essay_id") REFERENCES "public"."essays"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_change_log" ADD CONSTRAINT "prompt_change_log_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_change_log" ADD CONSTRAINT "prompt_change_log_prompt_id_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."prompts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_families" ADD CONSTRAINT "prompt_families_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_family_links" ADD CONSTRAINT "prompt_family_links_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_family_links" ADD CONSTRAINT "prompt_family_links_prompt_id_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."prompts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_family_links" ADD CONSTRAINT "prompt_family_links_family_id_prompt_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."prompt_families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_tag_links" ADD CONSTRAINT "prompt_tag_links_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_tag_links" ADD CONSTRAINT "prompt_tag_links_prompt_id_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."prompts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_tag_links" ADD CONSTRAINT "prompt_tag_links_tag_id_prompt_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."prompt_tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_tags" ADD CONSTRAINT "prompt_tags_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompts" ADD CONSTRAINT "prompts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompts" ADD CONSTRAINT "prompts_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompts" ADD CONSTRAINT "prompts_cycle_id_application_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."application_cycles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schools" ADD CONSTRAINT "schools_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schools" ADD CONSTRAINT "schools_cycle_id_application_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."application_cycles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cycles_workspace_label_unique" ON "application_cycles" USING btree ("workspace_id","label");--> statement-breakpoint
CREATE UNIQUE INDEX "assigned_response_prompt_unique" ON "assigned_essay_responses" USING btree ("prompt_id");--> statement-breakpoint
CREATE INDEX "assigned_response_essay_idx" ON "assigned_essay_responses" USING btree ("essay_id");--> statement-breakpoint
CREATE UNIQUE INDEX "essay_family_pair_unique" ON "essay_family_links" USING btree ("essay_id","family_id");--> statement-breakpoint
CREATE UNIQUE INDEX "essay_primary_family_unique" ON "essay_family_links" USING btree ("essay_id") WHERE "essay_family_links"."is_primary";--> statement-breakpoint
CREATE UNIQUE INDEX "essay_prompt_match_unique" ON "essay_prompt_matches" USING btree ("essay_id","prompt_id");--> statement-breakpoint
CREATE UNIQUE INDEX "essay_tag_pair_unique" ON "essay_tag_links" USING btree ("essay_id","tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "essay_version_number_unique" ON "essay_versions" USING btree ("essay_id","version_number");--> statement-breakpoint
CREATE INDEX "essays_workspace_idx" ON "essays" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "prompt_change_log_prompt_idx" ON "prompt_change_log" USING btree ("prompt_id");--> statement-breakpoint
CREATE UNIQUE INDEX "families_workspace_name_unique" ON "prompt_families" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "families_workspace_order_unique" ON "prompt_families" USING btree ("workspace_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "prompt_family_pair_unique" ON "prompt_family_links" USING btree ("prompt_id","family_id");--> statement-breakpoint
CREATE UNIQUE INDEX "prompt_primary_family_unique" ON "prompt_family_links" USING btree ("prompt_id") WHERE "prompt_family_links"."is_primary";--> statement-breakpoint
CREATE UNIQUE INDEX "prompt_tag_pair_unique" ON "prompt_tag_links" USING btree ("prompt_id","tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_workspace_name_unique" ON "prompt_tags" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE INDEX "prompts_workspace_idx" ON "prompts" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "prompts_school_idx" ON "prompts" USING btree ("school_id");--> statement-breakpoint
CREATE UNIQUE INDEX "prompts_school_external_ref_unique" ON "prompts" USING btree ("school_id","external_ref") WHERE "prompts"."external_ref" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "schools_workspace_name_unique" ON "schools" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE INDEX "schools_workspace_idx" ON "schools" USING btree ("workspace_id");