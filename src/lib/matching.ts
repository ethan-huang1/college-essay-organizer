import { PROMPT_FAMILIES } from "./db/taxonomy";
import { PROMPT_FUNCTIONS, type PromptFunction } from "./retrieval/category-review";

const FAMILY_NAME_BY_SLUG = new Map<string, string>(PROMPT_FAMILIES.map(([slug, name]) => [slug, name]));

/**
 * The four bands a student sees. There is deliberately no "ready to reuse":
 * essentially every reused essay needs some tailoring, so no label claims
 * otherwise.
 *
 * The gap between `reusable-edits` and `reusable-significant-edits` is
 * load-bearing and must not be collapsed. 68 means "a reasonably strong
 * foundation"; 52 means "substantial material is salvageable but expect to
 * rewrite most of it". Those are different pieces of advice, and the previous
 * two-state model could not express the difference.
 */
export type RecommendedAction =
  | "reusable-slight-edits"
  | "reusable-edits"
  | "reusable-significant-edits"
  | "new-response";

/** Ordered worst to best, so a ceiling is just a `min`. */
const BAND_ORDER: RecommendedAction[] = [
  "new-response",
  "reusable-significant-edits",
  "reusable-edits",
  "reusable-slight-edits",
];

export const ACTION_LABELS: Record<RecommendedAction, string> = {
  "reusable-slight-edits": "Reusable with slight edits",
  "reusable-edits": "Reusable with edits",
  "reusable-significant-edits": "Reusable with significant edits",
  "new-response": "New response recommended",
};

/**
 * How much rewriting the *length* difference implies, as its own axis.
 *
 * Separate from the score on purpose. A 250-word Georgetown activity essay and
 * a 50-word Stanford one can be near-perfect reuse candidates in substance
 * while needing real work to fit, and those are two different facts a student
 * needs told separately: "does this answer the question" and "how much editing
 * is that".
 */
export type AdaptationEffort = "minimal" | "some" | "significant-shortening" | "expansion";

export const ADAPTATION_LABELS: Record<AdaptationEffort, string> = {
  minimal: "Minimal adaptation",
  some: "Some adaptation",
  "significant-shortening": "Significant shortening required",
  expansion: "Expansion required",
};

export type MatchResult = {
  /**
   * How well the essay's substance answers the prompt, 0-100. Deliberately
   * unaffected by school-specific language, by word count, and by prompt
   * function: naming another university says nothing about whether the
   * underlying story fits, needing to cut 200 words says nothing either, and
   * `describe` versus `reflect` is a difference in framing rather than in
   * substance. All three are editing cost, and all three act as band ceilings
   * instead.
   */
  contentFitScore: number;
  /** Alias of contentFitScore, kept as the stored/displayed match score. */
  score: number;
  /** True when school-specific material must be changed before submitting. */
  adaptationRequired: boolean;
  matchedThemes: string[];
  missingRequirements: string[];
  wordCountDifference: number;
  /** The length axis, independent of the score. */
  adaptationEffort: AdaptationEffort;
  schoolSpecificityRisk: "low" | "medium" | "high";
  recommendedAction: RecommendedAction;
  explanation: string;
  /** Per-factor points, so any score can be explained without re-deriving it. */
  factors: { category: number; semantic: number; function: number };
  /** Why the band is lower than the score alone would give, if it is. */
  ceilings: string[];
};

export type MatchInput = {
  essayWordCount: number;
  essayPrimaryFamilySlug: string | null;
  essaySecondaryFamilySlugs: string[];
  /** Internal theme tags. Same vocabulary as the prompt's, never shown. */
  essayTags?: string[];
  essaySchoolSpecificPhrases: string[];
  /** What the essay actually does. Null when unknown - scores nothing either way. */
  essayFunction?: PromptFunction | null;
  promptSchoolName: string;
  promptPrimaryFamilySlug: string | null;
  promptSecondaryFamilySlugs: string[];
  promptTags?: string[];
  /** What the prompt asks the student to do. Null when unknown. */
  promptFunction?: PromptFunction | null;
  promptMinWordCount: number | null;
  promptMaxWordCount: number | null;
  /**
   * Semantic similarity, expressed as a z-score against this essay's own
   * similarity distribution across all prompts - NOT a raw cosine.
   *
   * Raw cosine between general-purpose embeddings puts almost any essay/prompt
   * pair in a narrow 0.6-0.9 band, because both are English prose about a
   * person, and comparing a long narrative to a short question compresses the
   * range further. Calibrating per essay answers the question that actually
   * matters - is this prompt closer than the average prompt? - and makes the
   * score independent of whatever absolute band the model happens to produce.
   *
   * Null when no embedding provider is configured. The factor then scores its
   * neutral value rather than zero.
   */
  semanticZScore?: number | null;
};

/**
 * Two scored factors, one weight vector, and nothing subtracted.
 *
 * **Function used to be a third factor and is now a ceiling only.** It scored
 * all-or-nothing: an exact match earned its full weight and anything else
 * earned zero, so Georgetown's `reflect` activity prompt against Harvard's
 * `describe` one forfeited 15 of 100 points for a difference the code's own
 * comment called "a step, not a rewrite". Measured, that single line cost three
 * of the twelve activity-family pairs a whole band. The evaluation had already
 * found the ceiling was where the factor's value lived - it "changes an outcome
 * on pairs the points had already decided" - so the points were doing harm and
 * the ceiling was doing the work. Keeping the ceiling and dropping the points
 * removes a factor rather than adding one.
 *
 * **There is no second weight vector.** `Other` used to switch the whole
 * formula to a reduced set capped at 85, which penalised a pair twice: no
 * primary points *and* a lower ceiling. It now takes the neutral rung on the
 * category ladder, like any other unavailable signal, so a perfect score is
 * exactly 100 for every pair and no band threshold moves silently.
 *
 * The split is 40/60 rather than 50/50 so that sharing a category cannot carry
 * a match on its own: a shared primary with floor-level semantic evidence
 * scores 40, which is `new-response`. The previous design's failure was the
 * opposite - a shared primary was worth 60 of the 80 needed for the top band,
 * with 106 of 255 prompts in one category and nothing in the score reading the
 * essay.
 */
const WEIGHTS = { category: 35, semantic: 45, function: 20 } as const;

/**
 * The knobs the calibration sweep varies, defaulted to what ships.
 *
 * A seam, not a feature. `scripts/analyse-factors.mts` has to score the same
 * pairs under several candidate configurations, and the alternative was a
 * second copy of the ladder inside the sweep - which would drift from this one
 * and quietly report on a formula the app does not run. Nothing in `src/`
 * passes this argument; production always takes the defaults.
 */
export type ScoringConfig = {
  categoryWeight: number;
  semanticWeight: number;
  /**
   * Weight of the function factor. **0 makes function a band ceiling only**,
   * which is the design this sweep exists to test against the alternatives.
   */
  functionWeight: number;
  /**
   * Credit for a function difference *inside* a group - `describe` against
   * `reflect`. 1 means such a difference costs nothing at all, which is the
   * property that matters: it is a change of framing, not of substance, and
   * charging for it is what kept the activity-prompt family apart.
   */
  sameGroupFraction: number;
};

/**
 * Credit for a function difference *inside* a group, as a fraction of the
 * function weight. `describe` against `reflect` earns 5 of 20 rather than 0.
 *
 * Chosen by sweep, not by taste - see docs/evaluation/scoring-sweep.md. The two
 * ends both fail:
 *
 * - At **0** (the old all-or-nothing rule) two of the twenty calibration
 *   positives fail. Georgetown's `reflect` activity prompt against Harvard's
 *   `describe` one forfeits the whole factor for a difference the code's own
 *   comment calls "a step, not a rewrite".
 * - At **1** (function reduced to a band ceiling) function scores full marks on
 *   50.2% of all pairs, because there are only two groups. A factor that is a
 *   near-constant discriminates nothing, and the free points took the share of
 *   pairs at or above the reuse floor from 18% to 32% - inflating everything,
 *   which is the one thing this redesign must not do.
 *
 * 0.25 keeps a within-group difference cheap enough that it never costs a band
 * on its own while leaving the factor able to separate a retrospective
 * narrative from a forward-looking commitment.
 */
const SAME_GROUP_FRACTION = 0.25;

export const DEFAULT_CONFIG: ScoringConfig = {
  categoryWeight: WEIGHTS.category,
  semanticWeight: WEIGHTS.semantic,
  functionWeight: WEIGHTS.function,
  sameGroupFraction: SAME_GROUP_FRACTION,
};

/**
 * Categories that describe a *format* rather than a subject.
 *
 * A list of five book titles, a note to a roommate and a one-line favourite are
 * not short essays about those things; they are different artefacts. Their
 * answers are reusable against each other and against essentially nothing else,
 * however much vocabulary they share - which is the shape of the lexical false
 * friend docs/evaluation/reuse-scoring.md documents.
 */
const FORMAT_CATEGORIES = new Set(["reading-list", "roommate", "shorts"]);

/**
 * The highest content-fit score a format mismatch can reach.
 *
 * A cap on the total rather than a rung on the category ladder, and that
 * distinction is the point. When one side is a list of five book titles and the
 * other is a 150-word essay, *no* signal in the formula is evidence of reuse -
 * not the shared vocabulary the embeddings see, and not the fact that both
 * prompts happen to say "describe". Measured: zeroing only the category factor
 * left that pair at 50 and a roommate note against a list of five things at 65,
 * because saturated semantic similarity plus an exact function match carried
 * them on their own.
 *
 * Two prompts of the *same* format are unaffected: a roommate note is a
 * perfectly good starting point for another roommate note. Only the mismatch is
 * capped.
 *
 * 40 sits below the 50 floor with room to spare, so such a pair is never
 * offered, and the band is forced to `new-response` besides.
 */
const FORMAT_MISMATCH_CAP = 40;

/**
 * Functions grouped by what they ask the writer to produce.
 *
 * Within a group the distance is small: `describe` -> `reflect` is a step, not a
 * rewrite. Across groups it is large, because a retrospective narrative and a
 * forward-looking commitment are different essays even when the topic is
 * identical. Only a cross-group mismatch caps the band.
 *
 * The specification is the reflective-Community vs future-contribution-Community
 * case: same category, strongly overlapping themes, and still not top band.
 */
const FUNCTION_GROUPS: Record<PromptFunction, "retrospective" | "forward"> = {
  describe: "retrospective",
  reflect: "retrospective",
  "explain-impact": "retrospective",
  "demonstrate-growth": "retrospective",
  "explain-motivation": "forward",
  "discuss-future-contribution": "forward",
  "connect-to-school": "forward",
  "state-a-future-goal": "forward",
};

/**
 * "Other" is a real category, but never evidence of a shared theme: two prompts
 * landing there have nothing in common except that nothing else fitted.
 */
const NO_SHARED_THEME = new Set(["other"]);

/**
 * Why Us counts as a shared theme only for the institution the essay was
 * written for.
 *
 * An institutional-fit essay's substance *is* the institution, so two Why Us
 * prompts at different schools share a form and not a word of content - and
 * this repo's design document says so outright: a Why Us essay is the one thing
 * a student must not recycle. Measured with Why Us treated like any other
 * category, it was involved in **27.8% of every top-band pair in the
 * catalogue**, 14.1% of the top band being one Why Us prompt against another,
 * because sharing a primary is the ladder's strongest rung and 62 prompts share
 * this one.
 *
 * **But excluding it outright was wrong**, and the demo workspace caught it: an
 * essay written for Brown's Open Curriculum stopped ranking Brown's own prompt
 * first, because with the category signal flat across every Why Us prompt there
 * was nothing left to distinguish them. Finding the right prompt for an essay
 * you have already written is the same feature as finding a reuse candidate,
 * and it has to keep working.
 *
 * So the condition is the institution rather than the category. The signal for
 * "this essay was written for this school" already exists and is already
 * computed here - the school-specific phrases detected in the essay's own prose.
 */
const isWhyUs = (slug: string) => slug === "why-us";

function writtenForThisSchool(input: MatchInput) {
  return input.essaySchoolSpecificPhrases.some(
    (phrase) => phrase.toLowerCase().includes(input.promptSchoolName.toLowerCase()),
  );
}

/**
 * Unknown signal scores neutral, never zero.
 *
 * Zero would punish an essay for a fact nobody has recorded: with no embedding
 * provider configured, every match would read as "nothing you have written
 * fits". Half the weight says "assume average" without inventing confidence.
 */
const neutral = (weight: number) => weight / 2;

/** Maps a calibrated z-score onto points. z >= +2 saturates, z <= -1 is zero. */
function semanticPoints(z: number | null | undefined, weight: number) {
  if (z === null || z === undefined) return neutral(weight);
  return Math.max(0, Math.min(weight, Math.round((weight * (z + 1)) / 3)));
}

/**
 * How much of the category signal two sides share, as one graded ladder.
 *
 * This replaces a 25-point all-or-nothing primary factor plus a 20-point
 * 7-per-shared-secondary factor. Those two overlapped - the secondary factor
 * already awarded 7 when one side's primary appeared in the other's
 * secondaries, on top of whatever primary scored - so the same relationship was
 * priced twice and inconsistently. One ladder prices each relationship once.
 *
 * The rung that matters most is the second. An essay whose whole subject is one
 * of the prompt's stated sub-themes is genuinely, strongly relevant, and the
 * old formula paid it 7 points against 25 for a shared primary. That is what
 * kept Princeton's service prompt out of reach of the activity essays that
 * answer it: right relationship, quarter price.
 *
 * Rungs are checked strongest-first and the first match wins. Secondary
 * *families* outrank *tags* because a family is a category someone chose, while
 * a tag is a theme; and two shared families outrank one, which is where
 * "several overlapping secondary categories" earns its substantial signal.
 */
function categoryPoints(input: MatchInput, weight: number) {
  const ownSchool = writtenForThisSchool(input);
  const meaningful = (slug: string | null | undefined): slug is string =>
    typeof slug === "string" && slug.length > 0
    && !NO_SHARED_THEME.has(slug)
    && !(isWhyUs(slug) && !ownSchool);

  const essayPrimary = input.essayPrimaryFamilySlug;
  const promptPrimary = input.promptPrimaryFamilySlug;

  const essayFamilies = new Set(input.essaySecondaryFamilySlugs.filter(meaningful));
  const promptFamilies = new Set(input.promptSecondaryFamilySlugs.filter(meaningful));
  const essayTags = new Set((input.essayTags ?? []).filter(meaningful));
  const promptTags = new Set((input.promptTags ?? []).filter(meaningful));

  const sharedFamilies = [...essayFamilies].filter((slug) => promptFamilies.has(slug));
  const sharedTags = [...essayTags].filter((slug) => promptTags.has(slug));

  const at = (fraction: number, themes: string[], reason: string) =>
    ({ points: weight * fraction, themes, reason });

  // Nobody recorded a category on one side. That is the absence of a signal,
  // not evidence of incompatibility, so it scores the neutral value the
  // semantic and function factors already use for unknowns.
  //
  // **`Other` is deliberately not this case.** A missing primary means nobody
  // looked; `Other` means someone read the prompt and found that no category
  // fits it, which is a finding rather than a gap. Treating the two the same
  // handed a free half-weight to 42% of all pairs - every pair involving one of
  // the 122 bespoke prompts - and took the share of pairs at or above the reuse
  // floor from 10% to 30%. Two prompts are not reuse candidates because neither
  // fitted anywhere.
  //
  // Neutral cannot rescue a weak match even where it does apply: neutral plus
  // median semantic evidence is `new-response`, and reaching the top band on it
  // needs near-saturated similarity.
  if (essayPrimary === null || promptPrimary === null) {
    return at(0.5, [...sharedFamilies, ...sharedTags], "no category recorded on one side");
  }

  // Below here `meaningful` gates the rungs that compare primaries. An `Other`
  // prompt skips those and falls through to its secondaries, which is where its
  // reuse signal actually lives: a bespoke prompt about service still shares
  // `service` with an essay about service.
  const comparable = meaningful(essayPrimary) && meaningful(promptPrimary);

  if (comparable && essayPrimary === promptPrimary) return at(1, [essayPrimary], "same category");

  // One side's whole subject is one of the other's stated sub-themes.
  if (meaningful(essayPrimary) && promptFamilies.has(essayPrimary)) {
    return at(0.85, [essayPrimary, ...sharedFamilies, ...sharedTags], "the prompt names this essay's category as a theme");
  }
  if (meaningful(promptPrimary) && essayFamilies.has(promptPrimary)) {
    return at(0.85, [promptPrimary, ...sharedFamilies, ...sharedTags], "this essay names the prompt's category as a theme");
  }

  if (sharedFamilies.length >= 2) return at(0.8, [...sharedFamilies, ...sharedTags], "several shared themes");
  if (sharedFamilies.length === 1) return at(0.65, [...sharedFamilies, ...sharedTags], "a shared theme");

  if (sharedTags.length > 0) {
    return at(Math.min(0.6, 0.4 + 0.1 * (sharedTags.length - 1)), sharedTags, "shared tags");
  }

  return at(0.15, [], "no shared category");
}

/**
 * Whether the prompt asks for something the essay does not do.
 *
 * A ceiling and nothing else. `describe` against `reflect` costs nothing at
 * all - both retrospective, and the difference is framing a writer changes in a
 * sentence. A retrospective narrative against a forward-looking commitment is a
 * different essay however well the topic matches, so it caps the band.
 *
 * "Known" is doing work: an essay whose function nobody recorded is neutral,
 * never mismatched. Otherwise every essay predating onboarding would be
 * permanently locked out of the top band.
 */
function functionCeiling(essayFn: PromptFunction | null | undefined, promptFn: PromptFunction | null | undefined) {
  if (!essayFn || !promptFn) return null;
  if (essayFn === promptFn) return null;
  return FUNCTION_GROUPS[essayFn] === FUNCTION_GROUPS[promptFn] ? null : ("reusable-edits" as const);
}

/**
 * How much of the function weight the pair earns.
 *
 * Graded, which is the whole correction. The old factor was all-or-nothing:
 * `describe` against `reflect` earned zero of 15 for a difference the code's own
 * comment called "a step, not a rewrite", and that single line cost three of
 * the twelve activity-family pairs a whole band.
 *
 * At `sameGroupFraction = 1` a within-group difference costs nothing, so the
 * factor only ever separates a retrospective narrative from a forward-looking
 * commitment - which is the one distinction it was built to make.
 *
 * Unknown on either side scores neutral, never mismatched: an essay whose
 * function nobody recorded must not be locked out of the top band.
 */
function functionPoints(
  essayFn: PromptFunction | null | undefined,
  promptFn: PromptFunction | null | undefined,
  weight: number,
  sameGroupFraction: number,
) {
  if (!essayFn || !promptFn) return neutral(weight);
  if (essayFn === promptFn) return weight;
  return FUNCTION_GROUPS[essayFn] === FUNCTION_GROUPS[promptFn] ? weight * sameGroupFraction : 0;
}

/**
 * How much school-specific material stands between this essay and submission.
 *
 * The *adaptation* axis, and it deliberately carries no score penalty. It used
 * to subtract 40 points from the content score, which conflated two independent
 * questions: a strong Stanford "Why Us" essay is a genuinely useful starting
 * point for Duke, it simply cannot be submitted unchanged.
 */
function schoolSpecificityRisk(promptPrimarySlug: string | null, promptSchoolName: string, essaySchoolSpecificPhrases: string[]) {
  if (essaySchoolSpecificPhrases.length === 0) return { risk: "low" as const };
  const referencesThisSchool = essaySchoolSpecificPhrases.some((phrase) => phrase.toLowerCase().includes(promptSchoolName.toLowerCase()));
  if (referencesThisSchool) return { risk: "low" as const };
  // A fit prompt carries the most institution-specific material, so it needs
  // the most rewriting - not disqualification.
  return { risk: promptPrimarySlug === "why-us" ? ("high" as const) : ("medium" as const) };
}

/**
 * Word count as editing cost: a band ceiling and an adaptation label, never a
 * score penalty.
 *
 * Cutting and tightening are ordinary reuse work, so a 500-word essay against a
 * 300-word prompt (retention 0.60) carries no ceiling at all and can reach the
 * top band on merit. The previous curve gave that case the same -25 it gave
 * 500 -> 50, so it could not tell condensing from rewriting.
 *
 * Under-length is deliberately more restrictive: you cannot condense your way
 * up to a length you have not written. The `fill < 0.15` row preserves a fixed
 * defect - a 15-word note once scored 80 against a 650-word prompt and was
 * recommended as ready to reuse. Such an essay is not shortened, it is not yet
 * written, so `new-response` is the honest label.
 */
function lengthAdaptation(essayWordCount: number, min: number | null, max: number | null): {
  ceiling: RecommendedAction | null;
  difference: number;
  reason: string | null;
  effort: AdaptationEffort;
} {
  // 41 catalogue prompts state a limit the schema has no column for - pages,
  // paragraphs, sentences, "13 words per stem" - and carry it in the prompt's
  // note instead. With no number to compare against there is no length claim to
  // make, so this reports minimal rather than inventing one. Reading a null
  // maximum as "zero words allowed" would label every one of them as needing
  // shortening.
  if (max === null) return { ceiling: null, difference: 0, reason: null, effort: "minimal" };
  const difference = essayWordCount - max;

  // Over length: keyed on retention, how much of the essay survives the cut.
  //
  // Boundaries chosen so that only genuinely extreme incompatibility caps the
  // band. Cutting a 500-word essay to 300 or even 250 is ordinary editing and
  // carries no ceiling; cutting it to 150 is substantial; cutting it to 50 is a
  // different essay.
  if (essayWordCount > max) {
    const retention = max / Math.max(essayWordCount, 1);
    if (retention < 0.15) return { ceiling: "reusable-significant-edits", difference, reason: "would have to be cut to a fraction of its length", effort: "significant-shortening" };
    if (retention < 0.35) return { ceiling: "reusable-edits", difference, reason: "needs substantial cutting", effort: "significant-shortening" };
    return { ceiling: null, difference, reason: null, effort: retention < 0.8 ? "some" : "minimal" };
  }

  // Under length is treated more strictly than over length, because the two are
  // not symmetric: you can cut 200 words from an essay you have written, but you
  // cannot condense your way up to a length you have not.
  if (min !== null) {
    // A small shortfall against a stated minimum is ordinary editing - adding a
    // paragraph. Only a real shortfall is an adaptation cost.
    if (essayWordCount < min * 0.75) {
      return { ceiling: "reusable-edits", difference, reason: "is well short of the stated minimum", effort: "expansion" };
    }
    return { ceiling: null, difference, reason: null, effort: essayWordCount < min ? "some" : "minimal" };
  }

  // No stated minimum, so there is no length the school has asked for - only the
  // question of whether this is an essay yet.
  const fill = essayWordCount / Math.max(max, 1);
  if (fill < 0.15) return { ceiling: "new-response", difference, reason: "is a fraction of the expected length", effort: "expansion" };
  if (fill < 0.3) return { ceiling: "reusable-edits", difference, reason: "is well under the expected length", effort: "expansion" };
  return { ceiling: null, difference, reason: null, effort: "minimal" };
}

// Compares the prompt's declared families against the essay's own assigned
// families rather than re-scanning free-form prose - an essay explicitly tagged
// with a family has "addressed" it regardless of whether its prose happens to
// contain any particular keyword phrase.
function missingRequirements(promptPrimarySlug: string | null, promptSecondarySlugs: string[], essayPrimarySlug: string | null, essaySecondarySlugs: string[]) {
  const essayFamilies = new Set([essayPrimarySlug, ...essaySecondarySlugs].filter(Boolean));
  return [promptPrimarySlug, ...promptSecondarySlugs]
    .filter((slug): slug is string => Boolean(slug))
    .filter((slug) => !essayFamilies.has(slug))
    .slice(0, 2)
    .map((slug) => `may not address ${FAMILY_NAME_BY_SLUG.get(slug) ?? slug} themes`);
}

function bandFromScore(score: number): RecommendedAction {
  if (score >= 70) return "reusable-slight-edits";
  if (score >= 60) return "reusable-edits";
  if (score >= 50) return "reusable-significant-edits";
  return "new-response";
}

const lowerOf = (a: RecommendedAction, b: RecommendedAction) =>
  BAND_ORDER.indexOf(a) <= BAND_ORDER.indexOf(b) ? a : b;

function explain(action: RecommendedAction, themes: string[], risk: "low" | "medium" | "high", missing: string[], ceilings: string[]) {
  const themeNames = themes.map((slug) => FAMILY_NAME_BY_SLUG.get(slug) ?? slug);
  const parts: string[] = [];
  parts.push(themeNames.length > 0 ? `Shares ${themeNames.join(", ")}.` : "No shared prompt family.");
  if (risk === "high") parts.push("Names another institution throughout — adapt the school-specific material before submitting.");
  else if (risk === "medium") parts.push("Contains another school's specific language — adapt it before reusing.");
  if (missing.length > 0) parts.push(`Gaps: ${missing.join("; ")}.`);
  if (ceilings.length > 0) parts.push(`Limited by: ${ceilings.join("; ")}.`);
  parts.push(`${ACTION_LABELS[action]}.`);
  return parts.join(" ");
}

/**
 * The length axis on its own, for callers that render it beside a stored score.
 *
 * Exported because `essay_prompt_matches` stores the score and the word-count
 * difference but not this, and every surface that shows a match already has the
 * prompt's limits in scope. Deriving it costs nothing and avoids a migration
 * for a value that is a pure function of three numbers.
 */
export const adaptationEffort = (essayWordCount: number, min: number | null, max: number | null): AdaptationEffort =>
  lengthAdaptation(essayWordCount, min, max).effort;

/**
 * Pure, deterministic, and fully explainable from its inputs alone - see
 * MVP_SPEC.md §5 ("matching logic must be transparent and testable") and §4's
 * Reuse Map requirements. The full design, including why each weight is what it
 * is, is docs/reuse-scoring.md.
 *
 * Two factors are summed into a content-fit score; nothing is subtracted.
 * Editing cost - school-specific material, word count, and a cross-group
 * function mismatch - lowers the *band* through ceilings, so the score always
 * answers one question ("does this essay answer this prompt?") and the band
 * answers the other ("how much work is it?").
 */
export function scoreMatch(input: MatchInput, config: ScoringConfig = DEFAULT_CONFIG): MatchResult {
  const fnCeiling = functionCeiling(input.essayFunction, input.promptFunction);

  // Exactly one side is a format rather than a subject: a list or a note
  // against prose. There is no reusable substance between them at all.
  // Any two *different* categories where either is a format. Not just prose
  // against a list: the three format categories are incompatible with each
  // other too, and lumping them into one bucket left a roommate note scoring 70
  // against a list of five things. Two prompts of the same format share a
  // primary and are handled by the top rung instead.
  const formatMismatch = input.essayPrimaryFamilySlug !== null && input.promptPrimaryFamilySlug !== null
    && input.essayPrimaryFamilySlug !== input.promptPrimaryFamilySlug
    && (FORMAT_CATEGORIES.has(input.essayPrimaryFamilySlug) || FORMAT_CATEGORIES.has(input.promptPrimaryFamilySlug));

  const category = categoryPoints(input, config.categoryWeight);
  const semantic = semanticPoints(input.semanticZScore, config.semanticWeight);
  const fn = functionPoints(input.essayFunction, input.promptFunction, config.functionWeight, config.sameGroupFraction);

  const risk = schoolSpecificityRisk(input.promptPrimaryFamilySlug, input.promptSchoolName, input.essaySchoolSpecificPhrases);
  const words = lengthAdaptation(input.essayWordCount, input.promptMinWordCount, input.promptMaxWordCount);
  const missing = missingRequirements(input.promptPrimaryFamilySlug, input.promptSecondaryFamilySlugs, input.essayPrimaryFamilySlug, input.essaySecondaryFamilySlugs);

  // Rounded once, here, rather than per factor: the ladder's fractions and the
  // neutral half-weights are both fractional, and rounding each would drift the
  // total. The score is an integer because that is what the band ladder and the
  // stored column are defined on.
  const summed = Math.round(category.points + semantic + fn);
  const contentFitScore = Math.max(0, Math.min(formatMismatch ? FORMAT_MISMATCH_CAP : 100, summed));

  // Ceilings compose: the band is the lowest any of them allows.
  let action = bandFromScore(contentFitScore);
  const ceilings: string[] = [];
  if (risk.risk === "high") {
    action = lowerOf(action, "reusable-significant-edits");
    ceilings.push("school-specific material throughout");
  } else if (risk.risk === "medium") {
    action = lowerOf(action, "reusable-edits");
    ceilings.push("another school's language");
  }
  if (words.ceiling) {
    action = lowerOf(action, words.ceiling);
    ceilings.push(`length: ${words.reason}`);
  }
  if (fnCeiling) {
    action = lowerOf(action, fnCeiling);
    ceilings.push("the prompt asks for something this essay does not do");
  }
  if (formatMismatch) {
    action = lowerOf(action, "new-response");
    ceilings.push("one is a list or a note and the other is an essay");
  }

  const themes = [...new Set(category.themes)];
  return {
    contentFitScore,
    score: contentFitScore,
    adaptationRequired: risk.risk !== "low",
    matchedThemes: themes.map((slug) => FAMILY_NAME_BY_SLUG.get(slug) ?? slug),
    missingRequirements: missing,
    wordCountDifference: words.difference,
    adaptationEffort: words.effort,
    schoolSpecificityRisk: risk.risk,
    recommendedAction: action,
    explanation: explain(action, themes, risk.risk, missing, ceilings),
    factors: { category: category.points, semantic, function: fn },
    ceilings,
  };
}

/** Exported for tests and for the evaluation harness. */
export const SCORING = { WEIGHTS, SAME_GROUP_FRACTION, FUNCTION_GROUPS, FORMAT_CATEGORIES, FORMAT_MISMATCH_CAP, BAND_ORDER, PROMPT_FUNCTIONS } as const;
