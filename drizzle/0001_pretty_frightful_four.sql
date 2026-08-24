ALTER TABLE `prompts` ADD `verification_status` text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE `prompts` ADD `source_url` text;--> statement-breakpoint
ALTER TABLE `prompts` ADD `retrieved_at` integer;