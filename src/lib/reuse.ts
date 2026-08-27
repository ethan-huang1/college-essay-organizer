import { eq } from "drizzle-orm";

import type { AppDatabase } from "./db/client";
import { assignedEssayResponses, essayFamilyLinks, essayPromptMatches, essayTagLinks, essays, promptFamilies, promptFamilyLinks, promptTagLinks, promptTags, prompts, schools } from "./db/schema";
import { scoreMatch } from "./matching";
import { categoryReview } from "./retrieval/category-review";
import { classifyText } from "./classification";
import { detectSchoolMentionsIn } from "./school-mentions";
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
  const [workspaceEssays, workspacePrompts, workspaceSchools, workspaceFamilies, essayLinks, promptLinks, workspaceTags, promptTagRows, essayTagRows, assignments] =
    await Promise.all([
      db.select().from(essays).where(eq(essays.workspaceId, workspaceId)).execute(),
      db.select().from(prompts).where(eq(prompts.workspaceId, workspaceId)).execute(),
      db.select().from(schools).where(eq(schools.workspaceId, workspaceId)).execute(),
      db.select().from(promptFamilies).where(eq(promptFamilies.workspaceId, workspaceId)).execute(),
      db.select().from(essayFamilyLinks).where(eq(essayFamilyLinks.workspaceId, workspaceId)).execute(),
      db.select().from(promptFamilyLinks).where(eq(promptFamilyLinks.workspaceId, workspaceId)).execute(),
      db.select().from(promptTags).where(eq(promptTags.workspaceId, workspaceId)).execute(),
      db.select().from(promptTagLinks).where(eq(promptTagLinks.workspaceId, workspaceId)).execute(),
      db.select().from(essayTagLinks).where(eq(essayTagLinks.workspaceId, workspaceId)).execute(),
      db.select().from(assignedEssayResponses).where(eq(assignedEssayResponses.workspaceId, workspaceId)).execute(),
    ]);
  const slugById = new Map(workspaceFamilies.map((family) => [family.id, family.slug]));
  const schoolNames = workspaceSchools.map((school) => school.name);

  // Theme tags carry the reuse signal for every prompt whose primary category
  // is Other - 94 of the 255 catalogue prompts - because Other means "no
  // meaningful shared category", so the secondaries are all there is. These
  // link tables were written but read by nothing until now.
  const tagNameById = new Map(workspaceTags.map((tag) => [tag.id, tag.name]));
  const tagsFor = (links: { tagId: string }[]) =>
    [...new Set(links.map((link) => tagNameById.get(link.tagId)).filter((name): name is string => Boolean(name)))];

  const schoolNameById = new Map(workspaceSchools.map((school) => [school.id, school.name]));
  const promptById = new Map(workspacePrompts.map((prompt) => [prompt.id, prompt]));
  /** What a prompt asks the student to do, from the catalogue review. */
  const functionOfPrompt = (promptId: string | null | undefined) => {
    const prompt = promptId ? promptById.get(promptId) : undefined;
    if (!prompt) return null;
    return categoryReview(schoolNameById.get(prompt.schoolId) ?? "", prompt.externalRef)?.[5] ?? null;
  };
  /**
   * An essay's own function, taken from a prompt it is already assigned to.
   *
   * If a student has said "this essay is my answer to that prompt", then what
   * the essay does is what that prompt asked for - no inference needed. This is
   * the same signal essays.origin_prompt_id would carry, from data that already
   * exists, so it needs no column.
   *
   * Null for an unassigned essay, which scores neutral rather than as a
   * mismatch. Without some source for this the function factor was neutral for
   * every essay in every workspace, which left it unable to do the one job it
   * exists for: keeping a reflective essay out of the top band for a prompt
   * asking what the student will contribute in future.
   */
  const essayFunctions = new Map<string, ReturnType<typeof functionOfPrompt>>();
  for (const assignment of assignments) {
    if (essayFunctions.get(assignment.essayId)) continue;
    const fn = functionOfPrompt(assignment.promptId);
    if (fn) essayFunctions.set(assignment.essayId, fn);
  }

  await db.transaction(async (tx) => {
    await tx.delete(essayPromptMatches).where(eq(essayPromptMatches.workspaceId, workspaceId));

    const rows = workspaceEssays.flatMap((essay) => {
      const essayFamilySlugs = resolveFamilySlugs(essayLinks.filter((link) => link.essayId === essay.id), slugById);
      const essayContentWordCount = wordCount(essay.currentContent);
      // The manual field is an override, not the only source: an essay that
      // names Stanford is school-specific whether or not the student
      // remembered to say so, and that field is empty by default - which is
      // why every essay used to read as low risk.
      // Title and body are analysed as separate fields, never concatenated: a
      // field boundary is a sentence boundary, and joining them with a space
      // made a body opening "Brown paper covered the table." look like a
      // mid-sentence proper noun.
      const schoolSpecificPhrases = [...new Set([
        ...essay.schoolSpecificPhrases,
        ...detectSchoolMentionsIn({ title: essay.title, body: essay.currentContent }, schoolNames),
      ])];

      // Essay-side theme signal, from three places, because relying on the
      // first alone left it empty for almost every essay.
      //
      // A student picks their essay's primary category and nothing else - the
      // UI has no secondary control - so essayTagLinks is empty in practice and
      // the secondary factor scored 0 for every essay. With semantic similarity
      // also unavailable and no recorded essay function, that left a shared
      // primary as the only earnable signal and compressed every score into a
      // narrow band no better than the category-equality shortcut this redesign
      // replaced.
      //
      // So the essay's own text is read with the same deterministic classifier
      // the catalogue uses. Title and body are analysed separately for the same
      // reason as school detection below: a field boundary is a sentence
      // boundary. This supplements the student's explicit classification and
      // never overrides it - the primary category stays whatever they chose.
      const derived = classifyText(`${essay.title}. ${essay.currentContent}`);
      const essayTags = [...new Set([
        ...tagsFor(essayTagRows.filter((link) => link.essayId === essay.id)),
        ...derived.tags,
      ])];
      const essaySecondarySlugs = [...new Set([
        ...essayFamilySlugs.secondary,
        ...derived.secondarySlugs.filter((slug) => slug !== essayFamilySlugs.primary),
      ])];

      return workspacePrompts.map((prompt) => {
        const promptFamilySlugs = resolveFamilySlugs(promptLinks.filter((link) => link.promptId === prompt.id), slugById);
        const school = workspaceSchools.find((candidate) => candidate.id === prompt.schoolId);
        // What the prompt asks the student to *do*. Null for a prompt the
        // student added, which scores neutral rather than as a mismatch.
        const promptFunction = functionOfPrompt(prompt.id);
        const result = scoreMatch({
          essayWordCount: essayContentWordCount,
          essayPrimaryFamilySlug: essayFamilySlugs.primary,
          essaySecondaryFamilySlugs: essaySecondarySlugs,
          essayTags,
          essaySchoolSpecificPhrases: schoolSpecificPhrases,
          essayFunction: essayFunctions.get(essay.id) ?? null,
          promptSchoolName: school?.name ?? "",
          promptPrimaryFamilySlug: promptFamilySlugs.primary,
          promptSecondaryFamilySlugs: promptFamilySlugs.secondary,
          promptTags: tagsFor(promptTagRows.filter((link) => link.promptId === prompt.id)),
          promptFunction,
          promptMinWordCount: prompt.minWordCount,
          promptMaxWordCount: prompt.maxWordCount,
          // No embedding provider is configured, so semantic similarity is
          // unavailable and its factor scores neutral. Stage E wires this up;
          // this same path is its rollback.
          semanticZScore: null,
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
