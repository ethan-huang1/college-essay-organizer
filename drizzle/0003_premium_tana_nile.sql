-- Hand-edited from drizzle-kit's output, which emitted a single
-- `ADD COLUMN "slug" text NOT NULL` with no default. That fails outright on any
-- table that already has rows, so the column is added nullable, backfilled, and
-- only then constrained.
--
-- The backfill reads the slug back out of the primary key, which is built as
-- `<workspaceId>:family:<slug>` by seedTaxonomy. That is deliberate: the id is
-- immutable, whereas `name` is user-editable, so a workspace where someone had
-- already renamed a category still resolves correctly.

ALTER TABLE "prompt_families" ADD COLUMN "slug" text;--> statement-breakpoint

UPDATE "prompt_families"
SET "slug" = split_part("id", ':family:', 2)
WHERE "slug" IS NULL AND position(':family:' in "id") > 0;--> statement-breakpoint

-- Fallback for any row whose id predates that convention: match the seeded
-- display names.
UPDATE "prompt_families" SET "slug" = CASE "name"
  WHEN 'Personal Statement / Core Story' THEN 'core-story'
  WHEN 'Identity & Background' THEN 'identity-background'
  WHEN 'Community & Contribution' THEN 'community-contribution'
  WHEN 'Challenge, Setback & Growth' THEN 'challenge-growth'
  WHEN 'Intellectual Curiosity' THEN 'intellectual-curiosity'
  WHEN 'Why Major / Academic Interests' THEN 'why-major'
  WHEN 'Why This School / Program' THEN 'why-school'
  WHEN 'Activities, Leadership & Impact' THEN 'activities-impact'
  WHEN 'Values, Perspective & Meaning' THEN 'values-meaning'
  WHEN 'Short Takes & Personality' THEN 'short-takes'
  ELSE "slug"
END
WHERE "slug" IS NULL;--> statement-breakpoint

-- Last resort so NOT NULL can be enforced without dropping anyone's data: a
-- slugified name, uniquified by id if two rows would collide.
UPDATE "prompt_families"
SET "slug" = regexp_replace(lower("name"), '[^a-z0-9]+', '-', 'g') || '-' || substr(md5("id"), 1, 6)
WHERE "slug" IS NULL OR "slug" = '';--> statement-breakpoint

ALTER TABLE "prompt_families" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "families_workspace_slug_unique" ON "prompt_families" USING btree ("workspace_id","slug");
