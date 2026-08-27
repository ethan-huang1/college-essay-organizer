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

export type MatchResult = {
  /**
   * How well the essay's substance answers the prompt, 0-100. Deliberately
   * unaffected by school-specific language and by word count: naming another
   * university says nothing about whether the underlying story fits, and
   * needing to cut 200 words says nothing either. Both are editing cost, and
   * both act as band ceilings instead.
   */
  contentFitScore: number;
  /** Alias of contentFitScore, kept as the stored/displayed match score. */
  score: number;
  /** True when school-specific material must be changed before submitting. */
  adaptationRequired: boolean;
  matchedThemes: string[];
  missingRequirements: string[];
  wordCountDifference: number;
  schoolSpecificityRisk: "low" | "medium" | "high";
  recommendedAction: RecommendedAction;
  explanation: string;
  /** Per-factor points, so any score can be explained without re-deriving it. */
  factors: { primary: number; semantic: number; secondary: number; function: number };
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
  /** What the essay actually does. Null when unknown - see FUNCTION_NEUTRAL. */
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
   * Null when no embedding provider is configured, which is the shipped state.
   * The factor then scores its neutral value rather than zero.
   */
  semanticZScore?: number | null;
};

/**
 * Factor weights. Two vectors, because `Other` cannot use the first factor.
 *
 * Primary category is deliberately the *smallest* factor. The previous formula
 * gave a shared primary 60 points on top of a 20 baseline, landing exactly on
 * the 80-point "ready to reuse" threshold - so two prompts sharing a broad
 * category were called ready to submit unchanged, with 106 of 255 prompts in
 * one category and nothing in the score reading the essay.
 */
const WEIGHTS = {
  normal: { primary: 25, semantic: 35, secondary: 20, function: 20 },
  /**
   * `Other` means "no meaningful reusable primary category exists", so sharing
   * that label is weak evidence - two bespoke prompts are not the same essay
   * because neither fitted anywhere. It earns no primary points and is
   * reweighted onto the signals that do carry information, for a ceiling of 85.
   *
   * There is no categorical bar on reaching the top band: an `Other` pair needs
   * 70 of the 85 available to it. Possible, and demanding. That is the intent -
   * `Other` is 94 of 255 catalogue prompts, so a blanket prohibition would tell
   * students that 37% of their prompts match nothing they have ever written.
   */
  other: { primary: 0, semantic: 40, secondary: 20, function: 25 },
} as const;

// "Other" is a real category but never a shared theme: two prompts landing
// there have nothing in common except that nothing else fitted.
const NOT_A_SHARED_THEME = new Set(["other"]);

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

function weightsFor(essayPrimary: string | null, promptPrimary: string | null) {
  const isOther = (slug: string | null) => slug !== null && NOT_A_SHARED_THEME.has(slug);
  return isOther(essayPrimary) || isOther(promptPrimary) ? WEIGHTS.other : WEIGHTS.normal;
}

/** All-or-nothing: the categories either agree or they do not. */
function primaryPoints(essayPrimary: string | null, promptPrimary: string | null, weight: number) {
  const meaningful = (slug: string | null) => Boolean(slug) && !NOT_A_SHARED_THEME.has(slug!);
  if (!meaningful(essayPrimary) || essayPrimary !== promptPrimary) return { points: 0, themes: [] as string[] };
  return { points: weight, themes: [essayPrimary!] };
}

/**
 * Unknown signal scores neutral, never zero.
 *
 * Zero would punish an essay for a fact nobody has recorded: with no embedding
 * provider configured, or an essay whose function was never captured, every
 * match would read as "nothing you have written fits". Half the weight says
 * "assume average" without inventing confidence.
 */
const neutral = (weight: number) => Math.round(weight / 2);

/** Maps a calibrated z-score onto points. z >= +2 saturates, z <= -1 is zero. */
function semanticPoints(z: number | null | undefined, weight: number) {
  if (z === null || z === undefined) return neutral(weight);
  return Math.max(0, Math.min(weight, Math.round((weight * (z + 1)) / 3)));
}

/**
 * Shared themes beyond the primary category, at 7 points each.
 *
 * Counts secondary families and internal tags together, because the review
 * vocabulary spans both - five of its seventeen secondaries are themselves
 * categories and the rest are tags. A primary appearing in the *other* side's
 * secondaries also counts: an essay whose main subject is one of the prompt's
 * stated sub-themes is genuinely relevant, and the previous formula recognised
 * this too.
 */
function secondaryPoints(input: MatchInput, weight: number) {
  const meaningful = (slug: string) => !NOT_A_SHARED_THEME.has(slug);
  const essaySignals = new Set([...input.essaySecondaryFamilySlugs, ...(input.essayTags ?? [])].filter(meaningful));
  const promptSignals = new Set([...input.promptSecondaryFamilySlugs, ...(input.promptTags ?? [])].filter(meaningful));

  const shared = new Set([...essaySignals].filter((slug) => promptSignals.has(slug)));
  if (input.essayPrimaryFamilySlug && meaningful(input.essayPrimaryFamilySlug) && promptSignals.has(input.essayPrimaryFamilySlug)) {
    shared.add(input.essayPrimaryFamilySlug);
  }
  if (input.promptPrimaryFamilySlug && meaningful(input.promptPrimaryFamilySlug) && essaySignals.has(input.promptPrimaryFamilySlug)) {
    shared.add(input.promptPrimaryFamilySlug);
  }
  return { points: Math.min(weight, shared.size * 7), themes: [...shared] };
}

/** Full points on a match, neutral when either side is unknown, zero otherwise. */
function functionFit(essayFn: PromptFunction | null | undefined, promptFn: PromptFunction | null | undefined, weight: number) {
  if (!essayFn || !promptFn) return { points: neutral(weight), severity: "unknown" as const };
  if (essayFn === promptFn) return { points: weight, severity: "match" as const };
  const distance = FUNCTION_GROUPS[essayFn] === FUNCTION_GROUPS[promptFn] ? ("minor" as const) : ("major" as const);
  return { points: 0, severity: distance };
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
 * Word count as editing cost, expressed as a band ceiling and never as a score
 * penalty.
 *
 * Cutting and tightening are ordinary reuse work, so a 500-word essay against a
 * 300-word prompt (retention 0.60) carries no ceiling at all and can reach the
 * top band on merit. The previous curve gave that case the same -25 it gave
 * 500 -> 50, so it could not tell condensing from rewriting.
 *
 * Under-length is deliberately more restrictive: you cannot condense your way
 * up to a length you have not written. The `fill < 0.25` row preserves a fixed
 * defect - a 15-word note once scored 80 against a 650-word prompt and was
 * recommended as ready to reuse. Such an essay is not shortened, it is not yet
 * written, so `new-response` is the honest label.
 */
function wordCountCeiling(essayWordCount: number, min: number | null, max: number | null) {
  if (max === null) return { ceiling: null, difference: 0, reason: null as string | null };
  const difference = essayWordCount - max;
  const lowerBound = min ?? 0;

  if (essayWordCount > max) {
    const retention = max / Math.max(essayWordCount, 1);
    if (retention < 0.2) return { ceiling: "reusable-significant-edits" as const, difference, reason: "needs cutting to a fraction of its length" };
    if (retention < 0.45) return { ceiling: "reusable-edits" as const, difference, reason: "needs substantial cutting" };
    return { ceiling: null, difference, reason: null };
  }

  if (essayWordCount < lowerBound) {
    return { ceiling: "reusable-edits" as const, difference, reason: "is under the stated minimum" };
  }

  // Only when the prompt states no minimum: if it states one and the essay
  // clears it, the school itself has said the length is acceptable.
  //
  // The 0.40 boundary was moved down from 0.60 by measurement, not preference.
  // At 0.60 this ceiling fired on most of the demo workspace - a 300-word essay
  // against a 650-word maximum is a legitimate answer, since schools state a
  // maximum rather than a target - and it was capping more pairs than the score
  // itself was deciding. A ceiling doing that much work means the score has
  // stopped mattering, which is the failure mode docs/reuse-scoring.md asks the
  // evaluation to watch for.
  if (min === null) {
    const fill = essayWordCount / Math.max(max, 1);
    if (fill < 0.25) return { ceiling: "new-response" as const, difference, reason: "is a fraction of the expected length" };
    if (fill < 0.4) return { ceiling: "reusable-edits" as const, difference, reason: "is well under the expected length" };
  }

  return { ceiling: null, difference, reason: null };
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
 * Pure, deterministic, and fully explainable from its inputs alone - see
 * MVP_SPEC.md §5 ("matching logic must be transparent and testable") and §4's
 * Reuse Map requirements. The full design, including why each weight is what it
 * is, is docs/reuse-scoring.md.
 *
 * Four independent factors are summed into a content-fit score; nothing is
 * subtracted. Editing cost - school-specific material, word count, and a
 * function mismatch - lowers the *band* through ceilings, so the score always
 * answers one question ("does this essay answer this prompt?") and the band
 * answers the other ("how much work is it?").
 */
export function scoreMatch(input: MatchInput): MatchResult {
  const weights = weightsFor(input.essayPrimaryFamilySlug, input.promptPrimaryFamilySlug);

  const primary = primaryPoints(input.essayPrimaryFamilySlug, input.promptPrimaryFamilySlug, weights.primary);
  const semantic = semanticPoints(input.semanticZScore, weights.semantic);
  const secondary = secondaryPoints(input, weights.secondary);
  const fn = functionFit(input.essayFunction, input.promptFunction, weights.function);

  const risk = schoolSpecificityRisk(input.promptPrimaryFamilySlug, input.promptSchoolName, input.essaySchoolSpecificPhrases);
  const words = wordCountCeiling(input.essayWordCount, input.promptMinWordCount, input.promptMaxWordCount);
  const missing = missingRequirements(input.promptPrimaryFamilySlug, input.promptSecondaryFamilySlugs, input.essayPrimaryFamilySlug, input.essaySecondaryFamilySlugs);

  const contentFitScore = Math.max(0, Math.min(100, primary.points + semantic + secondary.points + fn.points));

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
  if (fn.severity === "major") {
    action = lowerOf(action, "reusable-edits");
    ceilings.push("the prompt asks for something this essay does not do");
  }

  const themes = [...new Set([...primary.themes, ...secondary.themes])];
  return {
    contentFitScore,
    score: contentFitScore,
    adaptationRequired: risk.risk !== "low",
    matchedThemes: themes.map((slug) => FAMILY_NAME_BY_SLUG.get(slug) ?? slug),
    missingRequirements: missing,
    wordCountDifference: words.difference,
    schoolSpecificityRisk: risk.risk,
    recommendedAction: action,
    explanation: explain(action, themes, risk.risk, missing, ceilings),
    factors: { primary: primary.points, semantic, secondary: secondary.points, function: fn.points },
    ceilings,
  };
}

/** Exported for tests and for the evaluation harness. */
export const SCORING = { WEIGHTS, FUNCTION_GROUPS, BAND_ORDER, PROMPT_FUNCTIONS } as const;
