CREATE TABLE `prompt_change_log` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`prompt_id` text NOT NULL,
	`previous_prompt_text` text NOT NULL,
	`previous_min_word_count` integer,
	`previous_max_word_count` integer,
	`detected_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`prompt_id`) REFERENCES `prompts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `prompt_change_log_prompt_idx` ON `prompt_change_log` (`prompt_id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_prompts` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`school_id` text NOT NULL,
	`cycle_id` text,
	`title` text NOT NULL,
	`prompt_text` text NOT NULL,
	`min_word_count` integer,
	`max_word_count` integer,
	`min_char_count` integer,
	`max_char_count` integer,
	`requirement` text DEFAULT 'required' NOT NULL,
	`conditional_note` text,
	`deadline` integer,
	`status` text DEFAULT 'not-started' NOT NULL,
	`classification_confidence` integer DEFAULT 0 NOT NULL,
	`classification_source` text DEFAULT 'deterministic' NOT NULL,
	`verification_status` text DEFAULT 'manual' NOT NULL,
	`application_platform` text DEFAULT 'unknown' NOT NULL,
	`source_url` text,
	`retrieved_at` integer,
	`external_ref` text,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`cycle_id`) REFERENCES `application_cycles`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "prompts_word_count_nonnegative_check" CHECK(coalesce("__new_prompts"."min_word_count", 0) >= 0 and coalesce("__new_prompts"."max_word_count", 0) >= 0),
	CONSTRAINT "prompts_word_count_order_check" CHECK("__new_prompts"."min_word_count" is null or "__new_prompts"."max_word_count" is null or "__new_prompts"."max_word_count" >= "__new_prompts"."min_word_count"),
	CONSTRAINT "prompts_char_count_nonnegative_check" CHECK(coalesce("__new_prompts"."min_char_count", 0) >= 0 and coalesce("__new_prompts"."max_char_count", 0) >= 0),
	CONSTRAINT "prompts_char_count_order_check" CHECK("__new_prompts"."min_char_count" is null or "__new_prompts"."max_char_count" is null or "__new_prompts"."max_char_count" >= "__new_prompts"."min_char_count"),
	CONSTRAINT "prompts_confidence_range_check" CHECK("__new_prompts"."classification_confidence" between 0 and 100)
);
--> statement-breakpoint
INSERT INTO `__new_prompts`("id", "workspace_id", "school_id", "cycle_id", "title", "prompt_text", "min_word_count", "max_word_count", "requirement", "deadline", "status", "classification_confidence", "classification_source", "verification_status", "source_url", "retrieved_at", "notes", "created_at", "updated_at") SELECT "id", "workspace_id", "school_id", "cycle_id", "title", "prompt_text", "min_word_count", "max_word_count", "requirement", "deadline", "status", "classification_confidence", "classification_source", "verification_status", "source_url", "retrieved_at", "notes", "created_at", "updated_at" FROM `prompts`;--> statement-breakpoint
DROP TABLE `prompts`;--> statement-breakpoint
ALTER TABLE `__new_prompts` RENAME TO `prompts`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `prompts_workspace_idx` ON `prompts` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `prompts_school_idx` ON `prompts` (`school_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `prompts_school_external_ref_unique` ON `prompts` (`school_id`,`external_ref`) WHERE "prompts"."external_ref" is not null;