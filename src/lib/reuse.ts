import { eq } from "drizzle-orm";

import type { AppDatabase } from "./db/client";
import { PROMPT_FAMILIES } from "./db/taxonomy";
import { essayFamilyLinks, essayPromptMatches, essays, promptFamilies, promptFamilyLinks, prompts, schools } from "./db/schema";
import { scoreMatch } from "./matching";
import { wordCount } from "./essays";

const SLUG_BY_NAME = new Map<string, string>(PROMPT_FAMILIES.map(([slug, name]) => [name, slug]));

type FamilyLink = { familyId: string; isPrimary: boolean };

function resolveFamilySlugs(links: FamilyLink[], nameById: Map<string, string>) {
  const primaryId = links.find((link) => link.isPrimary)?.familyId ?? null;
  const secondaryIds = links.filter((link) => !link.isPrimary).map((link) => link.familyId);
  const toSlug = (id: string | null) => (id ? (SLUG_BY_NAME.get(nameById.get(id) ?? "") ?? null) : null);
  return {
    primary: toSlug(primaryId),
    secondary: secondaryIds.map(toSlug).filter((slug): slug is string => Boolean(slug)),
  };
}

// Recomputes every essay x prompt match for a workspace from scratch. This
// is O(essays x prompts), which is trivial at MVP scale, and avoids any
// risk of a stale/incremental match surviving after an essay or prompt
// changes - simpler and safer than trying to patch individual rows.
export async function recomputeWorkspaceMatches(db: AppDatabase, workspaceId: string) {
  const workspaceEssays = await db.select().from(essays).where(eq(essays.workspaceId, workspaceId));
  const workspacePrompts = await db.select().from(prompts).where(eq(prompts.workspaceId, workspaceId));
  const workspaceSchools = await db.select().from(schools).where(eq(schools.workspaceId, workspaceId));
  const workspaceFamilies = await db.select().from(promptFamilies).where(eq(promptFamilies.workspaceId, workspaceId));
  const essayLinks = await db.select().from(essayFamilyLinks).where(eq(essayFamilyLinks.workspaceId, workspaceId));
  const promptLinks = await db.select().from(promptFamilyLinks).where(eq(promptFamilyLinks.workspaceId, workspaceId));
  const nameById = new Map(workspaceFamilies.map((family) => [family.id, family.name]));

  await db.transaction(async (tx) => {
    await tx.delete(essayPromptMatches).where(eq(essayPromptMatches.workspaceId, workspaceId));

    const rows = workspaceEssays.flatMap((essay) => {
      const essayFamilySlugs = resolveFamilySlugs(essayLinks.filter((link) => link.essayId === essay.id), nameById);
      const essayContentWordCount = wordCount(essay.currentContent);

      return workspacePrompts.map((prompt) => {
        const promptFamilySlugs = resolveFamilySlugs(promptLinks.filter((link) => link.promptId === prompt.id), nameById);
        const school = workspaceSchools.find((candidate) => candidate.id === prompt.schoolId);
        const result = scoreMatch({
          essayWordCount: essayContentWordCount,
          essayPrimaryFamilySlug: essayFamilySlugs.primary,
          essaySecondaryFamilySlugs: essayFamilySlugs.secondary,
          essaySchoolSpecificPhrases: essay.schoolSpecificPhrases,
          promptSchoolName: school?.name ?? "",
          promptPrimaryFamilySlug: promptFamilySlugs.primary,
          promptSecondaryFamilySlugs: promptFamilySlugs.secondary,
          promptMinWordCount: prompt.minWordCount,
          promptMaxWordCount: prompt.maxWordCount,
        });
        return {
          id: crypto.randomUUID(),
          workspaceId,
          essayId: essay.id,
          promptId: prompt.id,
          score: result.score,
          matchedThemes: result.matchedThemes,
          missingRequirements: result.missingRequirements,
          wordCountDifference: result.wordCountDifference,
          schoolSpecificityRisk: result.schoolSpecificityRisk,
          recommendedAction: result.recommendedAction,
          explanation: result.explanation,
        };
      });
    });

    if (rows.length > 0) await tx.insert(essayPromptMatches).values(rows);
  });
}
