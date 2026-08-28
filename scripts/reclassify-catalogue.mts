/**
 * Applies the reviewed classification to prompts that already exist.
 *
 * Why this is needed: upsertPrompts writes category links only for prompts it
 * creates. An existing prompt whose content has not changed takes the
 * `counts.unchanged` branch and keeps whatever links it was first imported with,
 * so a change to the classification can never reach it. The reimport therefore
 * migrates the taxonomy and recomputes scores but leaves every existing prompt
 * classified as it was - which for this release means the reviewed categories
 * would never arrive.
 *
 * Hand classifications are preserved. A link whose source is 'manual' is a
 * student's own decision, and no automated pass may overwrite it: if a prompt's
 * primary link is manual, the prompt is skipped whole, secondaries included,
 * because rewriting its secondaries around a primary someone chose would leave a
 * combination nobody picked.
 *
 * Deliberate, human-run, and idempotent: a second run reports zero changes.
 *
 *   node --env-file-if-exists=.env.local --experimental-strip-types \
 *     --import ./scripts/ts-resolve.mjs scripts/reclassify-catalogue.mts [--dry-run]
 */
import { and, eq, inArray } from "drizzle-orm";

import { openDatabase } from "../src/lib/db/client.ts";
import { promptFamilies, promptFamilyLinks, promptTagLinks, promptTags, prompts, schools, workspaces } from "../src/lib/db/schema.ts";
import { categoryReview } from "../src/lib/retrieval/category-review.ts";
import { recomputeWorkspaceMatches } from "../src/lib/reuse.ts";

const dryRun = process.argv.includes("--dry-run");
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Refusing to guess at a database.");
  process.exit(2);
}

const { db, close } = openDatabase();
const totals = { prompts: 0, reviewed: 0, unchanged: 0, rewritten: 0, manualSkipped: 0, unreviewed: 0, recomputed: 0 };

try {
  const allWorkspaces = await db.select({ id: workspaces.id, name: workspaces.name }).from(workspaces);
  console.log(`${allWorkspaces.length} workspace(s)${dryRun ? " (dry run)" : ""}.`);

  for (const workspace of allWorkspaces) {
    const [families, tagRows, schoolRows, promptRows, linkRows] = await Promise.all([
      db.select().from(promptFamilies).where(eq(promptFamilies.workspaceId, workspace.id)),
      db.select().from(promptTags).where(eq(promptTags.workspaceId, workspace.id)),
      db.select().from(schools).where(eq(schools.workspaceId, workspace.id)),
      db.select().from(prompts).where(eq(prompts.workspaceId, workspace.id)),
      db.select().from(promptFamilyLinks).where(eq(promptFamilyLinks.workspaceId, workspace.id)),
    ]);
    const familyIdBySlug = new Map(families.map((f) => [f.slug, f.id]));
    const tagIdByName = new Map(tagRows.map((t) => [t.name, t.id]));
    const schoolNameById = new Map(schoolRows.map((s) => [s.id, s.name]));
    const linksByPrompt = new Map<string, typeof linkRows>();
    for (const link of linkRows) linksByPrompt.set(link.promptId, [...(linksByPrompt.get(link.promptId) ?? []), link]);

    let rewritten = 0;
    for (const prompt of promptRows) {
      totals.prompts += 1;
      const reviewed = categoryReview(schoolNameById.get(prompt.schoolId) ?? "", prompt.externalRef);
      if (!reviewed) { totals.unreviewed += 1; continue; }
      totals.reviewed += 1;

      const current = linksByPrompt.get(prompt.id) ?? [];
      if (current.some((link) => link.isPrimary && link.source === "manual")) {
        totals.manualSkipped += 1;
        continue;
      }

      const [, , primarySlug, familySlugs, tagNames] = reviewed;
      const primaryFamilyId = familyIdBySlug.get(primarySlug);
      if (!primaryFamilyId) {
        console.error(`  MISSING family "${primarySlug}" in ${workspace.name}; skipping ${prompt.title}`);
        continue;
      }
      const secondaryIds = familySlugs
        .map((slug) => familyIdBySlug.get(slug))
        .filter((id): id is string => Boolean(id) && id !== primaryFamilyId);

      const desired = new Set([`P:${primaryFamilyId}`, ...secondaryIds.map((id) => `S:${id}`)]);
      const actual = new Set(current.map((link) => `${link.isPrimary ? "P" : "S"}:${link.familyId}`));
      const same = desired.size === actual.size && [...desired].every((key) => actual.has(key));
      if (same) { totals.unchanged += 1; continue; }

      totals.rewritten += 1;
      rewritten += 1;
      if (dryRun) {
        const was = current.find((link) => link.isPrimary)?.familyId;
        const wasSlug = families.find((f) => f.id === was)?.slug ?? "none";
        console.log(`  ${workspace.name}: ${prompt.title} — ${wasSlug} -> ${primarySlug}`);
        continue;
      }

      await db.transaction(async (tx) => {
        await tx.delete(promptFamilyLinks).where(and(
          eq(promptFamilyLinks.workspaceId, workspace.id),
          eq(promptFamilyLinks.promptId, prompt.id),
        ));
        await tx.insert(promptFamilyLinks).values([
          { id: crypto.randomUUID(), workspaceId: workspace.id, promptId: prompt.id, familyId: primaryFamilyId, isPrimary: true, source: "deterministic" as const },
          ...secondaryIds.map((familyId) => ({
            id: crypto.randomUUID(), workspaceId: workspace.id, promptId: prompt.id, familyId, isPrimary: false, source: "deterministic" as const,
          })),
        ]);
        // Tags are additive signal, so they are replaced wholesale alongside the
        // families rather than merged: a stale tag is as misleading as a stale
        // category, and the review is the only writer of either.
        await tx.delete(promptTagLinks).where(and(
          eq(promptTagLinks.workspaceId, workspace.id),
          eq(promptTagLinks.promptId, prompt.id),
        ));
        const tagIds = tagNames.map((name) => tagIdByName.get(name)).filter((id): id is string => Boolean(id));
        if (tagIds.length > 0) {
          await tx.insert(promptTagLinks).values(tagIds.map((tagId) => ({
            id: crypto.randomUUID(), workspaceId: workspace.id, promptId: prompt.id, tagId,
          })));
        }
      });
    }
    console.log(`  ${workspace.name}: ${rewritten} prompt(s) reclassified`);

    if (!dryRun && rewritten > 0) {
      await recomputeWorkspaceMatches(db, workspace.id);
      totals.recomputed += 1;
    }
  }
  console.log("Done:", totals);
  void inArray;
} finally {
  await close();
}
