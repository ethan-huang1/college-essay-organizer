import { eq } from "drizzle-orm";

import type { AppDatabase } from "./db/client";
import { essayFamilyLinks, essayPromptMatches, essays, promptFamilies, promptFamilyLinks, prompts, schools } from "./db/schema";
import { scoreMatch } from "./matching";
import { detectSchoolMentions } from "./school-mentions";
import { wordCount } from "./essays";

type FamilyLink = { familyId: string; isPrimary: boolean };

// Resolved through the family's own slug column. This used to go via the
// display name, so a student renaming a category silently unmapped every
// family and collapsed every match in the workspace to the baseline score.
function resolveFamilySlugs(links: FamilyLink[], slugById: Map<string, string>) {
  const primaryId = links.find((link) => link.isPrimary)?.familyId ?? null;
  const secondaryIds = links.filter((link) => !link.isPrimary).map((link) => link.familyId);
  const toSlug = (id: string | null) => (id ? slugById.get(id) ?? null : null);
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
  const [workspaceEssays, workspacePrompts, workspaceSchools, workspaceFamilies, essayLinks, promptLinks] =
    await Promise.all([
      db.select().from(essays).where(eq(essays.workspaceId, workspaceId)).execute(),
      db.select().from(prompts).where(eq(prompts.workspaceId, workspaceId)).execute(),
      db.select().from(schools).where(eq(schools.workspaceId, workspaceId)).execute(),
      db.select().from(promptFamilies).where(eq(promptFamilies.workspaceId, workspaceId)).execute(),
      db.select().from(essayFamilyLinks).where(eq(essayFamilyLinks.workspaceId, workspaceId)).execute(),
      db.select().from(promptFamilyLinks).where(eq(promptFamilyLinks.workspaceId, workspaceId)).execute(),
    ]);
  const slugById = new Map(workspaceFamilies.map((family) => [family.id, family.slug]));
  const schoolNames = workspaceSchools.map((school) => school.name);

  await db.transaction(async (tx) => {
    await tx.delete(essayPromptMatches).where(eq(essayPromptMatches.workspaceId, workspaceId));

    const rows = workspaceEssays.flatMap((essay) => {
      const essayFamilySlugs = resolveFamilySlugs(essayLinks.filter((link) => link.essayId === essay.id), slugById);
      const essayContentWordCount = wordCount(essay.currentContent);
      // The manual field is an override, not the only source: an essay that
      // names Stanford is school-specific whether or not the student
      // remembered to say so, and that field is empty by default - which is
      // why every essay used to read as low risk.
      const schoolSpecificPhrases = [...new Set([
        ...essay.schoolSpecificPhrases,
        ...detectSchoolMentions(`${essay.title} ${essay.currentContent}`, schoolNames),
      ])];

      return workspacePrompts.map((prompt) => {
        const promptFamilySlugs = resolveFamilySlugs(promptLinks.filter((link) => link.promptId === prompt.id), slugById);
        const school = workspaceSchools.find((candidate) => candidate.id === prompt.schoolId);
        const result = scoreMatch({
          essayWordCount: essayContentWordCount,
          essayPrimaryFamilySlug: essayFamilySlugs.primary,
          essaySecondaryFamilySlugs: essayFamilySlugs.secondary,
          essaySchoolSpecificPhrases: schoolSpecificPhrases,
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
