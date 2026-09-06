/**
 * Scores a regression case exactly the way the app scores a real pair, minus
 * the two things a case deliberately holds constant.
 *
 * The stand-in essay is a catalogue prompt's committed embedding, so nothing
 * here loads a model or touches the network - which is what lets the regression
 * set run in the ordinary test suite rather than only in a script.
 *
 * Held constant on purpose:
 *
 * - **Word count is put in range.** A case is a claim about substance, and the
 *   length ceilings have their own tests. Left real, the Stanford activity
 *   prompt's 50-word cap would cap almost every activity-family case and the
 *   set would be measuring the ceilings instead of the score.
 * - **No school-specific phrases.** Same reason: the school-specificity ceiling
 *   is tested separately, and a stand-in essay has no prose to detect names in.
 *
 * Calibrated across all unique catalogue prompts, matching `reuse.ts`: the
 * z-score answers "is this prompt closer than the average prompt for this
 * essay", so the population it is measured against has to be the same one.
 */
import { calibrate, cosine, decodeVector } from "./embedding";
import { type MatchResult, scoreMatch } from "./matching";
import { classifyUnreviewedPrompt } from "./classification";
import { inferPromptFunction } from "./prompt-function";
import { type PromptFunction, categoryReview } from "./retrieval/category-review";
import { PROMPT_VECTORS } from "./retrieval/prompt-vectors";
import { listCoveredSchoolNames, lookupSchoolSource } from "./retrieval/registry";
import type { PromptKey } from "./reuse-cases";

type Scored = {
  key: string;
  school: string;
  title: string;
  primary: string;
  secondaryFamilies: string[];
  tags: string[];
  fn: PromptFunction | null;
  vector: number[] | undefined;
};

/** Normalised title-plus-text: the unique-prompt identity, as in the harnesses. */
const signatureOf = (title: string, text: string) =>
  `${title}||${text}`.toLowerCase().replace(/\s+/g, " ").trim();

let cache: { byKey: Map<string, Scored>; unique: Scored[] } | null = null;

function corpus() {
  if (cache) return cache;
  const vectorByKey = new Map(PROMPT_VECTORS.map(([school, ref, encoded]) => [`${school}|${ref}`, decodeVector(encoded)]));
  const byKey = new Map<string, Scored>();
  const seen = new Set<string>();
  const unique: Scored[] = [];

  for (const school of listCoveredSchoolNames()) {
    for (const prompt of lookupSchoolSource(school)?.prompts ?? []) {
      const reviewed = categoryReview(school, prompt.externalRef);
      // Reviewed rows win; the rest fall through to the keyword classifier and
      // the function inference, exactly as college-import.ts does. So a case
      // measures the classification the app actually has, and improving the
      // classification moves these numbers without touching the formula.
      const guess = reviewed ? null : classifyUnreviewedPrompt(`${prompt.title} ${prompt.promptText}`);
      const item: Scored = {
        key: `${school}|${prompt.externalRef}`,
        school,
        title: prompt.title,
        primary: reviewed ? reviewed[2] : guess!.primarySlug ?? "other",
        secondaryFamilies: reviewed ? reviewed[3] : guess!.secondarySlugs,
        tags: reviewed ? reviewed[4] : guess!.tags,
        fn: reviewed ? reviewed[5] : inferPromptFunction(prompt.title, prompt.promptText),
        vector: vectorByKey.get(`${school}|${prompt.externalRef}`),
      };
      byKey.set(item.key, item);
      const signature = signatureOf(prompt.title, prompt.promptText);
      if (!seen.has(signature)) { seen.add(signature); unique.push(item); }
    }
  }
  cache = { byKey, unique };
  return cache;
}

/** Test-only: forgets the corpus so a regenerated review is picked up. */
export function resetCaseCorpusForTests() {
  cache = null;
}

const zCache = new Map<string, Map<string, number>>();

function zFor(essay: Scored) {
  const existing = zCache.get(essay.key);
  if (existing) return existing;
  const { unique } = corpus();
  const targets = unique.filter((item): item is Scored & { vector: number[] } => Boolean(item.vector));
  if (!essay.vector) {
    const empty = new Map<string, number>();
    zCache.set(essay.key, empty);
    return empty;
  }
  const calibrated = calibrate(targets.map((target) => cosine(essay.vector!, target.vector)));
  const map = new Map(targets.map((target, index) => [target.key, calibrated[index]]));
  zCache.set(essay.key, map);
  return map;
}

const lookup = ([school, ref]: PromptKey) => {
  const item = corpus().byKey.get(`${school}|${ref}`);
  if (!item) throw new Error(`regression case names a prompt that is not in the catalogue: ${school} / ${ref}`);
  return item;
};

export function scoreCase(from: PromptKey, to: PromptKey, essaySchoolSpecificPhrases: string[] = []): MatchResult & { z: number | null } {
  const essay = lookup(from);
  const prompt = lookup(to);
  // The unique representative carries the vector, so a case naming a duplicate
  // record (one of the seven UC campuses) still resolves to a z-score.
  const z = zFor(essay).get(prompt.key) ?? null;
  const result = scoreMatch({
    // In range by construction: no minimum, and a maximum the essay meets.
    essayWordCount: 300,
    promptMinWordCount: null,
    promptMaxWordCount: 300,
    essaySchoolSpecificPhrases,
    essayPrimaryFamilySlug: essay.primary,
    essaySecondaryFamilySlugs: essay.secondaryFamilies,
    essayTags: essay.tags,
    essayFunction: essay.fn,
    promptSchoolName: prompt.school,
    promptPrimaryFamilySlug: prompt.primary,
    promptSecondaryFamilySlugs: prompt.secondaryFamilies,
    promptTags: prompt.tags,
    promptFunction: prompt.fn,
    semanticZScore: z,
  });
  return { ...result, z };
}

export const caseLabel = (from: PromptKey, to: PromptKey) =>
  `${lookup(from).school} "${lookup(from).title}" -> ${lookup(to).school} "${lookup(to).title}"`;
