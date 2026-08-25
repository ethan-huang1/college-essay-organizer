import { eq, inArray, sql } from "drizzle-orm";

import type { AppDatabase } from "./client";
import { essayFamilyLinks, essayTagLinks, promptFamilies, promptFamilyLinks, promptTagLinks, promptTags } from "./schema";
import { LEGACY_FAMILY_SLUG_MAP, PROMPT_FAMILIES, RETIRED_FAMILY_SLUGS } from "./taxonomy";
import { seedTaxonomy } from "./seed";

/**
 * Moves one workspace from the ten-category taxonomy to the seven.
 *
 * Every existing link row is *repointed*, never deleted: a student who
 * classified thirty prompts by hand keeps all thirty classifications, remapped.
 * The four retired categories collapse into Other and additionally gain an
 * internal tag recording which concept they were, so the reuse signal those
 * four carried survives without becoming a user-facing category.
 *
 * Runs as one transaction per workspace. A partly-migrated taxonomy would break
 * classification and matching everywhere, so it either completes or does not
 * happen.
 *
 * Idempotent: a workspace already on the seven returns immediately.
 */
export async function migrateWorkspaceTaxonomy(db: AppDatabase, workspaceId: string) {
  // Everything - reads included - runs inside one transaction, because the
  // writes below delete this workspace's link rows wholesale and reinsert them
  // from what was read. Reading outside the transaction left a window in which
  // a link committed by the running app after the read would be deleted and
  // never reinserted, silently losing a classification a student had just made.
  // The advisory lock is held for the transaction and keyed to the workspace, so
  // two concurrent runs cannot interleave on the same one either.
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`taxonomy:${workspaceId}`}))`);

    const existing = await tx.select().from(promptFamilies).where(eq(promptFamilies.workspaceId, workspaceId));
    if (existing.length === 0) return { migrated: false as const, reason: "no taxonomy" };

    const targetSlugs = new Set(PROMPT_FAMILIES.map(([slug]) => slug));
    const legacyRows = existing.filter((family) => !targetSlugs.has(family.slug as never));
    if (legacyRows.length === 0) return { migrated: false as const, reason: "already migrated" };

    const newFamilyId = (slug: string) => `${workspaceId}:family:${slug}`;

    const [promptLinks, essayLinks, tags] = await Promise.all([
      tx.select().from(promptFamilyLinks).where(eq(promptFamilyLinks.workspaceId, workspaceId)).execute(),
      tx.select().from(essayFamilyLinks).where(eq(essayFamilyLinks.workspaceId, workspaceId)).execute(),
      tx.select().from(promptTags).where(eq(promptTags.workspaceId, workspaceId)).execute(),
    ]);
    const tagIdByName = new Map(tags.map((tag) => [tag.name, tag.id]));

    const slugById = new Map(existing.map((family) => [family.id, family.slug]));

  /**
   * Repoints one side's links, deduping as it goes.
   *
   * Collapsing four categories into one can produce duplicate (owner, family)
   * pairs and several rows claiming isPrimary, both of which the partial unique
   * indexes reject - so the dedupe has to happen before the insert, not be
   * discovered by it. The highest-precedence primary wins and the rest are
   * demoted to secondary.
   */
  function remap<T extends { id: string; familyId: string; isPrimary: boolean; source: "deterministic" | "manual" }>(
    links: T[],
    ownerOf: (link: T) => string,
  ) {
    const byOwner = new Map<string, { familyId: string; isPrimary: boolean; source: T["source"] }[]>();
    for (const link of links) {
      const slug = slugById.get(link.familyId);
      if (!slug) continue;
      const newSlug = LEGACY_FAMILY_SLUG_MAP[slug] ?? slug;
      const rows = byOwner.get(ownerOf(link)) ?? [];
      rows.push({ familyId: newFamilyId(newSlug), isPrimary: link.isPrimary, source: link.source });
      byOwner.set(ownerOf(link), rows);
    }

    const resolved: { owner: string; familyId: string; isPrimary: boolean; source: T["source"] }[] = [];
    for (const [owner, rows] of byOwner) {
      const seen = new Set<string>();
      let primaryTaken = false;
      // Primaries first, so the surviving primary is a real one rather than
      // whichever row happened to come first.
      // If any of the collapsing rows was hand-classified, the survivor has to
      // stay 'manual'. Choosing purely by isPrimary let a manual secondary and
      // a deterministic primary retire onto the same family and kept the
      // deterministic one, so a student's own classification silently started
      // reading as auto-generated.
      const manualFamilies = new Set(rows.filter((row) => row.source === "manual").map((row) => row.familyId));
      for (const row of [...rows].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))) {
        if (seen.has(row.familyId)) continue;
        seen.add(row.familyId);
        const isPrimary = row.isPrimary && !primaryTaken;
        if (isPrimary) primaryTaken = true;
        const source = manualFamilies.has(row.familyId) ? ("manual" as T["source"]) : row.source;
        resolved.push({ owner, familyId: row.familyId, isPrimary, source });
      }
    }
    return resolved;
  }

  const newPromptLinks = remap(promptLinks, (link) => link.promptId);
  const newEssayLinks = remap(essayLinks, (link) => link.essayId);

  /** The retired concept each owner used to be filed under, as internal tags. */
  function retiredTags(links: { familyId: string }[], ownerOf: (link: { familyId: string }) => string) {
    const rows: { owner: string; tagId: string }[] = [];
    const seen = new Set<string>();
    for (const link of links) {
      const slug = slugById.get(link.familyId);
      const retired = slug ? RETIRED_FAMILY_SLUGS[slug] : undefined;
      if (!retired) continue;
      const tagId = tagIdByName.get(RETIRED_TAG_NAMES[retired]);
      if (!tagId) continue;
      const key = `${ownerOf(link)}:${tagId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ owner: ownerOf(link), tagId });
    }
    return rows;
  }

  const newPromptTags = retiredTags(promptLinks, (link) => (link as typeof promptLinks[number]).promptId);
  const newEssayTags = retiredTags(essayLinks, (link) => (link as typeof essayLinks[number]).essayId);

    // Links go first: they reference the family rows about to be deleted.
    await tx.delete(promptFamilyLinks).where(eq(promptFamilyLinks.workspaceId, workspaceId));
    await tx.delete(essayFamilyLinks).where(eq(essayFamilyLinks.workspaceId, workspaceId));
    // Then EVERY family row, not only the ones whose slug is being retired.
    // A surviving slug still holds a sortOrder the new set needs - `why-major`
    // was 6 before and 4 after - and seedTaxonomy's onConflictDoNothing would
    // silently skip whichever new row collided with it, leaving families
    // missing and the link inserts below failing on a foreign key. Every link
    // is already captured in memory and repointed by computed id, so clearing
    // the table is safe.
    await tx.delete(promptFamilies).where(eq(promptFamilies.workspaceId, workspaceId));

    await seedTaxonomy(tx, workspaceId);

    if (newPromptLinks.length > 0) {
      await tx.insert(promptFamilyLinks).values(newPromptLinks.map((row) => ({
        id: crypto.randomUUID(),
        workspaceId,
        promptId: row.owner,
        familyId: row.familyId,
        isPrimary: row.isPrimary,
        source: row.source,
      })));
    }
    if (newEssayLinks.length > 0) {
      await tx.insert(essayFamilyLinks).values(newEssayLinks.map((row) => ({
        id: crypto.randomUUID(),
        workspaceId,
        essayId: row.owner,
        familyId: row.familyId,
        isPrimary: row.isPrimary,
        source: row.source,
      })));
    }
    if (newPromptTags.length > 0) {
      await tx.insert(promptTagLinks)
        .values(newPromptTags.map((row) => ({ id: crypto.randomUUID(), workspaceId, promptId: row.owner, tagId: row.tagId })))
        .onConflictDoNothing();
    }
    if (newEssayTags.length > 0) {
      await tx.insert(essayTagLinks)
        .values(newEssayTags.map((row) => ({ id: crypto.randomUUID(), workspaceId, essayId: row.owner, tagId: row.tagId })))
        .onConflictDoNothing();
    }

    return {
      migrated: true as const,
      promptLinks: newPromptLinks.length,
      essayLinks: newEssayLinks.length,
      tags: newPromptTags.length + newEssayTags.length,
    };
  });
}

// The seeded tag rows use display names; the taxonomy's retired concepts are
// slugs.
const RETIRED_TAG_NAMES: Record<string, string> = {
  "intellectual-curiosity": "intellectual curiosity",
  "challenge-growth": "challenge & growth",
  "activities-impact": "activities & impact",
  "values-meaning": "values & meaning",
};

/** Reports the ids of every workspace still on a pre-seven taxonomy. */
export async function workspacesNeedingTaxonomyMigration(db: AppDatabase) {
  const targetSlugs = PROMPT_FAMILIES.map(([slug]) => slug);
  const stale = await db.select({ workspaceId: promptFamilies.workspaceId })
    .from(promptFamilies)
    .where(inArray(promptFamilies.slug, Object.keys(LEGACY_FAMILY_SLUG_MAP).filter((slug) => !targetSlugs.includes(slug as never))));
  return [...new Set(stale.map((row) => row.workspaceId))];
}
