import { eq } from "drizzle-orm";

import type { AppDatabase } from "./db/client";
import { assignedEssayResponses, essayFamilyLinks, essayPromptMatches, essayTagLinks, essays, promptFamilies, promptFamilyLinks, promptTagLinks, promptTags, prompts, schools } from "./db/schema";
import { scoreMatch } from "./matching";
import { categoryReview } from "./retrieval/category-review";
import { classifyText } from "./classification";
import { EMBEDDING_MODEL, calibrate, cosine, decodeVector, embedTexts } from "./embedding";
import { PROMPT_VECTOR_MODEL, PROMPT_VECTORS } from "./retrieval/prompt-vectors";
import { inferPromptFunction } from "./prompt-function";
import { essayEmbeddingText } from "./semantic";
import { detectSchoolMentionsIn } from "./school-mentions";
import { wordCount } from "./essays";

type FamilyLink = { familyId: string; isPrimary: boolean };

/**
 * Committed catalogue vectors, decoded once per process.
 *
 * Decoding all 255 costs a fraction of a millisecond and happens on first use,
 * so a workspace with no essays never pays for it.
 */
let promptVectors: Map<string, number[]> | null = null;
function catalogueVectors() {
  promptVectors ??= new Map(PROMPT_VECTORS.map(([school, ref, encoded]) => [`${school}|${ref}`, decodeVector(encoded)]));
  return promptVectors;
}

/**
 * Refuses to compare vectors from two different models.
 *
 * An embedding is only meaningful against another from the same model, and
 * nothing enforced that: PROMPT_VECTOR_MODEL was written into the generated file
 * and never read. Changing EMBEDDING_MODEL without re-running the precompute
 * script would have compared new essay vectors against old prompt vectors -
 * quietly wrong if the dimensions happened to agree, and NaN-silent if they did
 * not, which resolved every pair in the workspace to "new response" with nothing
 * in the stored explanation to say so.
 *
 * Degrades to the no-provider path rather than throwing, because that path is
 * already correct and supported, and taking the whole workspace's matching down
 * over a stale generated file would be a worse failure than scoring one factor
 * neutral. Loud once per process so it cannot pass unnoticed.
 */
let warnedAboutModelMismatch = false;
function vectorsUsableWithCurrentModel() {
  if (PROMPT_VECTOR_MODEL === EMBEDDING_MODEL) return true;
  if (!warnedAboutModelMismatch) {
    warnedAboutModelMismatch = true;
    console.error(
      `[reuse] Committed prompt vectors were produced by ${PROMPT_VECTOR_MODEL} but EMBEDDING_MODEL is ${EMBEDDING_MODEL}. ` +
      "Semantic similarity is disabled until scripts/precompute-prompt-vectors.mts is re-run.",
    );
  }
  return false;
}

/**
 * Essay embeddings, keyed by the exact text embedded.
 *
 * Recomputing matches is O(essays x prompts) and runs on every save, so without
 * this an unchanged essay would be re-embedded on every recomputation. Keyed by
 * content rather than essay id so an edit invalidates itself, and bounded so a
 * long-lived server process cannot grow without limit.
 */
const essayVectorCache = new Map<string, number[]>();
const ESSAY_VECTOR_CACHE_LIMIT = 200;

async function essayVectors(texts: string[]): Promise<Map<string, number[]> | null> {
  const missing = [...new Set(texts.filter((text) => !essayVectorCache.has(text)))];
  if (missing.length > 0) {
    const computed = await embedTexts(missing);
    // Null means no provider: the caller falls back to a neutral semantic score
    // rather than treating "we cannot tell" as "these do not match".
    if (!computed) return null;
    for (const [index, text] of missing.entries()) {
      if (essayVectorCache.size >= ESSAY_VECTOR_CACHE_LIMIT) {
        essayVectorCache.delete(essayVectorCache.keys().next().value!);
      }
      essayVectorCache.set(text, computed[index]);
    }
  }
  return new Map(texts.map((text) => [text, essayVectorCache.get(text)!]));
}

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
      db.select().from(assignedEssayResponses)
        .where(eq(assignedEssayResponses.workspaceId, workspaceId))
        .orderBy(assignedEssayResponses.assignedAt)
        .execute(),
    ]);
  /**
   * Only essay prompts are scored.
   *
   * A graded-paper requirement, a writing sample and a caption on a portfolio
   * item are not essays, so "which of your essays could answer this" has no
   * meaning for them. Filtering here rather than penalising them in
   * matching.ts is the point: it was never a scoring problem. Measured before
   * this, Princeton's graded-paper instruction surfaced as a 60-point reuse
   * suggestion, because a long paragraph of submission rules reads as
   * semantically similar to a long essay.
   */
  const scorablePrompts = workspacePrompts.filter((prompt) => prompt.supportingMaterial === null);

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
  /**
   * What each essay does, by a fixed order of authority.
   *
   * 1. An explicit catalogue origin prompt. A person said which prompt this was
   *    written for and that prompt has a reviewed function, so nothing beats it.
   * 2. An explicit pasted origin prompt, classified from its text. Still the
   *    student's own statement of what the essay answers; only the function is
   *    inferred, at ~77% measured precision.
   * 3. The earliest assignment, for essays predating origin capture. Ordered by
   *    assignedAt so it is deterministic, and earliest so that accepting a reuse
   *    suggestion cannot redefine the essay - a later assignment is a reuse
   *    *target*, and letting one supply the function would make the suggestion
   *    evidence for itself.
   * 4. The essay's own text. Weakest tier by some distance: the rules were built
   *    for prompts, and an essay is not a prompt.
   * 5. Unknown, which matching scores neutral rather than as a mismatch.
   *
   * Every tier below the first two is a fallback for legacy essays. Once an
   * origin is recorded, tiers 3 and 4 can never override it.
   */
  const essayFunctions = new Map<string, ReturnType<typeof functionOfPrompt>>();
  const originSource = new Map<string, "origin-prompt" | "pasted-origin" | "assignment" | "essay-text">();

  for (const essay of workspaceEssays) {
    if (essay.originPromptId) {
      const fn = functionOfPrompt(essay.originPromptId);
      if (fn) {
        essayFunctions.set(essay.id, fn);
        originSource.set(essay.id, "origin-prompt");
        continue;
      }
    }
    if (essay.originPromptText) {
      const fn = inferPromptFunction(essay.originPromptTitle ?? "", essay.originPromptText);
      if (fn) {
        essayFunctions.set(essay.id, fn);
        originSource.set(essay.id, "pasted-origin");
      }
    }
  }

  for (const assignment of assignments) {
    if (essayFunctions.has(assignment.essayId)) continue;
    const fn = functionOfPrompt(assignment.promptId);
    if (fn) {
      essayFunctions.set(assignment.essayId, fn);
      originSource.set(assignment.essayId, "assignment");
    }
  }

  for (const essay of workspaceEssays) {
    if (essayFunctions.has(essay.id)) continue;
    const fn = inferPromptFunction(essay.title, essay.currentContent);
    if (fn) {
      essayFunctions.set(essay.id, fn);
      originSource.set(essay.id, "essay-text");
    }
  }
  void originSource;

  // Semantic similarity, computed before the transaction because embedding is
  // the slow part and holding a transaction open across it would serialise
  // every other write in the workspace behind a model call.
  const essayTexts = new Map(workspaceEssays.map((essay) => [essay.id, essayEmbeddingText(essay.title, essay.currentContent)]));
  const vectors = workspaceEssays.length > 0 && vectorsUsableWithCurrentModel()
    ? await essayVectors([...essayTexts.values()])
    : new Map<string, number[]>();
  const vectorFor = (prompt: { schoolId: string; externalRef: string | null }) => {
    const school = workspaceSchools.find((candidate) => candidate.id === prompt.schoolId);
    return prompt.externalRef ? catalogueVectors().get(`${school?.name ?? ""}|${prompt.externalRef}`) : undefined;
  };

  /**
   * Per-essay z-scores, calibrated across every prompt in the workspace.
   *
   * Calibrated per essay rather than globally, because the useful question is
   * "is this prompt closer than the average prompt *for this essay*". Raw
   * cosines from this model sit in a narrow band that shifts with text length,
   * so a global threshold would rank essays against each other instead of
   * ranking prompts for one essay.
   */
  const zScores = new Map<string, Map<string, number>>();
  if (vectors) {
    for (const essay of workspaceEssays) {
      const essayVector = vectors.get(essayTexts.get(essay.id)!);
      if (!essayVector) continue;
      // Only prompts with a committed vector take part; a prompt the student
      // added has none and scores neutral.
      const scored = scorablePrompts
        .map((prompt) => ({ prompt, vector: vectorFor(prompt) }))
        .filter((entry): entry is { prompt: typeof entry.prompt; vector: number[] } => Boolean(entry.vector))
        .map((entry) => ({ promptId: entry.prompt.id, similarity: cosine(essayVector, entry.vector) }));
      const calibrated = calibrate(scored.map((entry) => entry.similarity));
      zScores.set(essay.id, new Map(scored.map((entry, index) => [entry.promptId, calibrated[index]])));
    }
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

      return scorablePrompts.map((prompt) => {
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
          // Undefined for a prompt with no committed vector, or when no
          // provider is available: matching then scores this factor neutral
          // rather than treating "we cannot tell" as "no match".
          semanticZScore: zScores.get(essay.id)?.get(prompt.id) ?? null,
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
