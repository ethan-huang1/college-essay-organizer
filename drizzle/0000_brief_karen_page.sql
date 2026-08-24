CREATE TABLE `application_cycles` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`label` text NOT NULL,
	`start_year` integer NOT NULL,
	`end_year` integer NOT NULL,
	`is_active` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "cycles_year_order_check" CHECK("application_cycles"."end_year" >= "application_cycles"."start_year")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cycles_workspace_label_unique` ON `application_cycles` (`workspace_id`,`label`);--> statement-breakpoint
CREATE TABLE `assigned_essay_responses` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`prompt_id` text NOT NULL,
	`essay_id` text NOT NULL,
	`essay_version_id` text,
	`assigned_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`prompt_id`) REFERENCES `prompts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`essay_id`) REFERENCES `essays`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`essay_version_id`) REFERENCES `essay_versions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assigned_response_prompt_unique` ON `assigned_essay_responses` (`prompt_id`);--> statement-breakpoint
CREATE INDEX `assigned_response_essay_idx` ON `assigned_essay_responses` (`essay_id`);--> statement-breakpoint
CREATE TABLE `essay_family_links` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`essay_id` text NOT NULL,
	`family_id` text NOT NULL,
	`is_primary` integer DEFAULT false NOT NULL,
	`source` text DEFAULT 'deterministic' NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`essay_id`) REFERENCES `essays`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`family_id`) REFERENCES `prompt_families`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `essay_family_pair_unique` ON `essay_family_links` (`essay_id`,`family_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `essay_primary_family_unique` ON `essay_family_links` (`essay_id`) WHERE "essay_family_links"."is_primary" = 1;--> statement-breakpoint
CREATE TABLE `essay_prompt_matches` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`essay_id` text NOT NULL,
	`prompt_id` text NOT NULL,
	`score` integer NOT NULL,
	`matched_themes` text DEFAULT '[]' NOT NULL,
	`missing_requirements` text DEFAULT '[]' NOT NULL,
	`word_count_difference` integer DEFAULT 0 NOT NULL,
	`school_specificity_risk` text DEFAULT 'low' NOT NULL,
	`recommended_action` text NOT NULL,
	`explanation` text NOT NULL,
	`calculated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`essay_id`) REFERENCES `essays`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`prompt_id`) REFERENCES `prompts`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "essay_prompt_score_range_check" CHECK("essay_prompt_matches"."score" between 0 and 100)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `essay_prompt_match_unique` ON `essay_prompt_matches` (`essay_id`,`prompt_id`);--> statement-breakpoint
CREATE TABLE `essay_tag_links` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`essay_id` text NOT NULL,
	`tag_id` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`essay_id`) REFERENCES `essays`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `prompt_tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `essay_tag_pair_unique` ON `essay_tag_links` (`essay_id`,`tag_id`);--> statement-breakpoint
CREATE TABLE `essay_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`essay_id` text NOT NULL,
	`version_number` integer NOT NULL,
	`content` text NOT NULL,
	`word_count` integer NOT NULL,
	`reason` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`essay_id`) REFERENCES `essays`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "essay_version_positive_check" CHECK("essay_versions"."version_number" > 0),
	CONSTRAINT "essay_version_words_nonnegative_check" CHECK("essay_versions"."word_count" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `essay_version_number_unique` ON `essay_versions` (`essay_id`,`version_number`);--> statement-breakpoint
CREATE TABLE `essays` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`title` text NOT NULL,
	`current_content` text DEFAULT '' NOT NULL,
	`target_word_count` integer,
	`status` text DEFAULT 'idea' NOT NULL,
	`designation` text DEFAULT 'canonical' NOT NULL,
	`adapted_from_essay_id` text,
	`notes` text,
	`school_specific_phrases` text DEFAULT '[]' NOT NULL,
	`last_edited_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`adapted_from_essay_id`) REFERENCES `essays`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "essays_target_words_nonnegative_check" CHECK("essays"."target_word_count" is null or "essays"."target_word_count" >= 0)
);
--> statement-breakpoint
CREATE INDEX `essays_workspace_idx` ON `essays` (`workspace_id`);--> statement-breakpoint
CREATE TABLE `prompt_families` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`color` text NOT NULL,
	`sort_order` integer NOT NULL,
	`is_editable` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `families_workspace_name_unique` ON `prompt_families` (`workspace_id`,`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `families_workspace_order_unique` ON `prompt_families` (`workspace_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `prompt_family_links` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`prompt_id` text NOT NULL,
	`family_id` text NOT NULL,
	`is_primary` integer DEFAULT false NOT NULL,
	`source` text DEFAULT 'deterministic' NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`prompt_id`) REFERENCES `prompts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`family_id`) REFERENCES `prompt_families`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prompt_family_pair_unique` ON `prompt_family_links` (`prompt_id`,`family_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `prompt_primary_family_unique` ON `prompt_family_links` (`prompt_id`) WHERE "prompt_family_links"."is_primary" = 1;--> statement-breakpoint
CREATE TABLE `prompt_tag_links` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`prompt_id` text NOT NULL,
	`tag_id` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`prompt_id`) REFERENCES `prompts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `prompt_tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prompt_tag_pair_unique` ON `prompt_tag_links` (`prompt_id`,`tag_id`);--> statement-breakpoint
CREATE TABLE `prompt_tags` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_workspace_name_unique` ON `prompt_tags` (`workspace_id`,`name`);--> statement-breakpoint
CREATE TABLE `prompts` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`school_id` text NOT NULL,
	`cycle_id` text,
	`title` text NOT NULL,
	`prompt_text` text NOT NULL,
	`min_word_count` integer,
	`max_word_count` integer,
	`requirement` text DEFAULT 'required' NOT NULL,
	`deadline` integer,
	`status` text DEFAULT 'not-started' NOT NULL,
	`classification_confidence` integer DEFAULT 0 NOT NULL,
	`classification_source` text DEFAULT 'deterministic' NOT NULL,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`cycle_id`) REFERENCES `application_cycles`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "prompts_word_count_nonnegative_check" CHECK(coalesce("prompts"."min_word_count", 0) >= 0 and coalesce("prompts"."max_word_count", 0) >= 0),
	CONSTRAINT "prompts_word_count_order_check" CHECK("prompts"."min_word_count" is null or "prompts"."max_word_count" is null or "prompts"."max_word_count" >= "prompts"."min_word_count"),
	CONSTRAINT "prompts_confidence_range_check" CHECK("prompts"."classification_confidence" between 0 and 100)
);
--> statement-breakpoint
CREATE INDEX `prompts_workspace_idx` ON `prompts` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `prompts_school_idx` ON `prompts` (`school_id`);--> statement-breakpoint
CREATE TABLE `schools` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`cycle_id` text,
	`name` text NOT NULL,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`cycle_id`) REFERENCES `application_cycles`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `schools_workspace_name_unique` ON `schools` (`workspace_id`,`name`);--> statement-breakpoint
CREATE INDEX `schools_workspace_idx` ON `schools` (`workspace_id`);--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
