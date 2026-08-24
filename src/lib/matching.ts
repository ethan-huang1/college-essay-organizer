import { PROMPT_FAMILIES } from "./db/taxonomy";

const FAMILY_NAME_BY_SLUG = new Map<string, string>(PROMPT_FAMILIES.map(([slug, name]) => [slug, name]));

export type RecommendedAction = "ready-to-reuse" | "minor-adaptation" | "major-adaptation" | "new-response";

export type MatchResult = {
  score: number;
  matchedThemes: string[];
  missingRequirements: string[];
  wordCountDifference: number;
  schoolSpecificityRisk: "low" | "medium" | "high";
  recommendedAction: RecommendedAction;
  explanation: string;
};

export type MatchInput = {
  essayWordCount: number;
  essayPrimaryFamilySlug: string | null;
  essaySecondaryFamilySlugs: string[];
  essaySchoolSpecificPhrases: string[];
  promptSchoolName: string;
  promptPrimaryFamilySlug: string | null;
  promptSecondaryFamilySlugs: string[];
  promptMinWordCount: number | null;
  promptMaxWordCount: number | null;
};

function familyOverlapScore(essayPrimary: string | null, essaySecondary: string[], promptPrimary: string | null, promptSecondary: string[]) {
  if (essayPrimary && promptPrimary && essayPrimary === promptPrimary) return { points: 60, themes: [essayPrimary] };
  const essayAll = new Set([essayPrimary, ...essaySecondary].filter(Boolean));
  const promptAll = new Set([promptPrimary, ...promptSecondary].filter(Boolean));
  const overlap = [...essayAll].filter((slug) => promptAll.has(slug)) as string[];
  if (overlap.length === 0) return { points: 0, themes: [] };
  const primaryCrossesSecondary = (essayPrimary && promptSecondary.includes(essayPrimary)) || (promptPrimary && essaySecondary.includes(promptPrimary));
  return { points: primaryCrossesSecondary ? 25 : Math.min(20, overlap.length * 10), themes: overlap };
}

function wordCountPenalty(essayWordCount: number, min: number | null, max: number | null) {
  if (max === null) return { points: 0, difference: 0 };
  const difference = essayWordCount - max;
  const lowerBound = min ?? 0;
  if (essayWordCount >= lowerBound && essayWordCount <= max) return { points: 0, difference };
  const overBy = essayWordCount > max ? essayWordCount - max : lowerBound - essayWordCount;
  const ratio = overBy / Math.max(max, 1);
  return { points: ratio > 0.35 ? -25 : -10, difference };
}

function schoolSpecificityRisk(promptPrimarySlug: string | null, promptSchoolName: string, essaySchoolSpecificPhrases: string[]) {
  if (essaySchoolSpecificPhrases.length === 0) return { risk: "low" as const, points: 0 };
  const referencesThisSchool = essaySchoolSpecificPhrases.some((phrase) => phrase.toLowerCase().includes(promptSchoolName.toLowerCase()));
  if (promptPrimarySlug === "why-school") {
    return referencesThisSchool ? { risk: "low" as const, points: 0 } : { risk: "high" as const, points: -40 };
  }
  return referencesThisSchool ? { risk: "low" as const, points: 0 } : { risk: "medium" as const, points: -15 };
}

// Compares the prompt's declared families against the essay's own assigned
// families (the same taxonomy signal used for the main family-overlap
// score) rather than re-scanning free-form prose - an essay explicitly
// tagged with a family has "addressed" it regardless of whether its prose
// happens to contain any particular keyword phrase.
function missingRequirements(promptPrimarySlug: string | null, promptSecondarySlugs: string[], essayPrimarySlug: string | null, essaySecondarySlugs: string[]) {
  const essayFamilies = new Set([essayPrimarySlug, ...essaySecondarySlugs].filter(Boolean));
  return [promptPrimarySlug, ...promptSecondarySlugs]
    .filter((slug): slug is string => Boolean(slug))
    .filter((slug) => !essayFamilies.has(slug))
    .slice(0, 2)
    .map((slug) => `may not address ${FAMILY_NAME_BY_SLUG.get(slug) ?? slug} themes`);
}

function recommendAction(score: number, risk: "low" | "medium" | "high"): RecommendedAction {
  let action: RecommendedAction = score >= 80 ? "ready-to-reuse" : score >= 55 ? "minor-adaptation" : score >= 30 ? "major-adaptation" : "new-response";
  if (risk === "high" && (action === "ready-to-reuse" || action === "minor-adaptation")) action = "major-adaptation";
  return action;
}

function explain(action: RecommendedAction, themes: string[], risk: "low" | "medium" | "high", missing: string[]) {
  const themeNames = themes.map((slug) => FAMILY_NAME_BY_SLUG.get(slug) ?? slug);
  const parts: string[] = [];
  parts.push(themeNames.length > 0 ? `Shares ${themeNames.join(", ")}.` : "No shared prompt family.");
  if (risk === "high") parts.push("Institution-specific language doesn't match this school — treat as a new response.");
  else if (risk === "medium") parts.push("Contains another school's specific language — review before reusing.");
  if (missing.length > 0) parts.push(`Gaps: ${missing.join("; ")}.`);
  const actionLabel = { "ready-to-reuse": "Ready to reuse.", "minor-adaptation": "Needs minor adaptation.", "major-adaptation": "Needs major adaptation.", "new-response": "Best written fresh." }[action];
  parts.push(actionLabel);
  return parts.join(" ");
}

// Pure, deterministic, and fully explainable from its inputs alone - see
// MVP_SPEC.md §5 ("matching logic must be transparent and testable") and
// §4's Reuse Map requirements. No category-equality shortcut: family
// overlap, word-count fit, and school-specificity risk are scored and
// penalized independently.
export function scoreMatch(input: MatchInput): MatchResult {
  const family = familyOverlapScore(input.essayPrimaryFamilySlug, input.essaySecondaryFamilySlugs, input.promptPrimaryFamilySlug, input.promptSecondaryFamilySlugs);
  const words = wordCountPenalty(input.essayWordCount, input.promptMinWordCount, input.promptMaxWordCount);
  const risk = schoolSpecificityRisk(input.promptPrimaryFamilySlug, input.promptSchoolName, input.essaySchoolSpecificPhrases);
  const missing = missingRequirements(input.promptPrimaryFamilySlug, input.promptSecondaryFamilySlugs, input.essayPrimaryFamilySlug, input.essaySecondaryFamilySlugs);

  const baseline = 20; // a floor so two essays with zero signal still land as "new-response", not a negative score
  const score = Math.max(0, Math.min(100, baseline + family.points + words.points + risk.points - missing.length * 5));
  const recommendedAction = recommendAction(score, risk.risk);

  return {
    score,
    matchedThemes: family.themes.map((slug) => FAMILY_NAME_BY_SLUG.get(slug) ?? slug),
    missingRequirements: missing,
    wordCountDifference: words.difference,
    schoolSpecificityRisk: risk.risk,
    recommendedAction,
    explanation: explain(recommendedAction, family.themes, risk.risk, missing),
  };
}
