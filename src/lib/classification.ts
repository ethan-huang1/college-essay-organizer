import { PROMPT_FAMILIES } from "./db/taxonomy";

// Deterministic, keyword-based classifier. No model calls, no network - see
// MVP_SPEC.md §5: "do not require a paid API key... implement a
// deterministic local/demo provider." Every classification below is
// transparent and reproducible from its keyword hits alone.

const FAMILY_KEYWORDS: Record<(typeof PROMPT_FAMILIES)[number][0], string[]> = {
  "core-story": [
    "defining experience", "tell us your story", "who you are", "background story", "central to your identity",
    "personal statement", "shaped who you are", "story only you can tell", "narrative",
  ],
  "identity-background": [
    "identity", "culture", "cultural background", "family background", "heritage", "upbringing", "diversity",
    "lived experience", "where you come from", "formative environment", "ethnicity", "traditions",
  ],
  "community-contribution": [
    "community", "belonging", "service", "collaboration", "contribute", "contribution", "give back",
    "volunteer", "neighborhood", "group you belong to",
  ],
  "challenge-growth": [
    "challenge", "setback", "obstacle", "failure", "conflict", "resilience", "overcame", "difficulty",
    "adversity", "recovered from", "lesson you learned", "mistake",
  ],
  "intellectual-curiosity": [
    "intellectual", "curiosity", "idea", "question", "research", "learning beyond", "genuinely excited about learning",
    "book that", "explore a topic", "subject you explored",
  ],
  "why-major": [
    "your intended major", "academic interest", "why do you want to study", "field of study", "academic direction",
    "course of study", "your major", "career goals", "interdisciplinary",
  ],
  "why-school": [
    "why us", "why this school", "why our university", "why our college", "specific programs", "our campus",
    "resources on our campus", "our community", "students possess an intellectual vitality",
  ],
  "activities-impact": [
    "extracurricular", "activity", "leadership", "initiative", "responsibility", "project", "employment",
    "work experience", "measurable impact", "made a difference",
  ],
  "values-meaning": [
    "values", "belief", "ethical", "disagreement", "changed your mind", "perspective", "priorities",
    "what matters to you", "reconsidered", "principle",
  ],
  "short-takes": [
    "roommate", "favorite", "list five", "quick answers", "in a few words", "short answer", "rapid fire",
    "gratitude", "joy", "quirky",
  ],
};

export type ClassificationResult = {
  primarySlug: string | null;
  secondarySlugs: string[];
  confidence: number;
  scores: Record<string, number>;
};

// A pure function over text - no DB access - so it's trivially unit-testable
// and reusable for both prompts and essays.
export function classifyText(text: string): ClassificationResult {
  const lower = text.toLowerCase();
  const scores: Record<string, number> = {};

  for (const [slug, keywords] of Object.entries(FAMILY_KEYWORDS)) {
    scores[slug] = keywords.reduce((hits, keyword) => (lower.includes(keyword) ? hits + 1 : hits), 0);
  }

  const ranked = Object.entries(scores)
    .filter(([, score]) => score > 0)
    .sort(([, a], [, b]) => b - a);

  if (ranked.length === 0) {
    return { primarySlug: null, secondarySlugs: [], confidence: 0, scores };
  }

  const [primarySlug, topScore] = ranked[0];
  const secondarySlugs = ranked.slice(1, 4).map(([slug]) => slug);
  // Confidence reflects how dominant the top family's hit count is - more
  // hits, and less competition from runner-up families, means higher
  // confidence. Always explainable from `scores` alone.
  const runnerUpScore = ranked[1]?.[1] ?? 0;
  const confidence = Math.min(100, Math.round((topScore / (topScore + runnerUpScore * 0.5 + 1)) * 100));

  return { primarySlug, secondarySlugs, confidence, scores };
}
