// The seven categories a student actually sorts supplemental essays into.
// MVP_SPEC.md section 2 previously specified ten; that list mixed the way a
// student groups their own work ("this is my Why Us essay") with themes a
// reader might notice in it ("this one is about values"), and the extra three
// were never a decision anybody had to make. The retired four survive as
// internal matching tags (see RETIRED_FAMILY_TAGS) so reuse signal is not lost.
//
// Order is the seed's sortOrder, and Other is deliberately last: it is a real
// seventh category for prompts that genuinely fit nowhere else, NOT a
// "needs attention" bucket. Whether a classification needs review is a separate
// question, answered by prompts.classificationConfidence.
export const PROMPT_FAMILIES = [
  ["community", "Community & Contribution", "Belonging, service, collaboration, community impact, and intended contribution.", "#59644d"],
  ["shorts", "Short Answers", "Roommate notes, lists, favourites, and other short-form or character-limited responses.", "#3f6b65"],
  ["diversity", "Identity & Background", "Culture, family, upbringing, identity, lived experience, and formative environment.", "#9a6048"],
  ["why-major", "Why Major", "Academic interests, intended field of study, and reasons for pursuing it.", "#56617a"],
  ["why-us", "Why Us", "Institutional fit: specific programs, resources, culture, location, and intended contribution.", "#8a493f"],
  ["personal-statement", "Personal Statement", "Open-ended personal narrative: a defining experience, growth, or the central story only you can tell.", "#7b403c"],
  ["other", "Other", "Prompts that do not fit the six categories above. A real category, not a to-do list.", "#6c5b51"],
] as const;

// The four concepts the seven-category taxonomy retired. They are no longer
// user-facing categories - the student sees exactly seven - but each still
// carries real reuse signal, so the import path records it as an internal tag
// on the prompt or essay instead of discarding it. There is no UI for these.
export const RETIRED_FAMILY_TAGS = [
  "intellectual-curiosity",
  "challenge-growth",
  "activities-impact",
  "values-meaning",
] as const;

// How a pre-existing workspace's ten categories map onto the seven. Every link
// row is repointed rather than deleted, so no student loses a classification;
// the four that collapse into `other` also gain the matching tag above.
export const RETIRED_FAMILY_SLUGS: Record<string, (typeof RETIRED_FAMILY_TAGS)[number]> = {
  "intellectual-curiosity": "intellectual-curiosity",
  "challenge-growth": "challenge-growth",
  "activities-impact": "activities-impact",
  "values-meaning": "values-meaning",
};

export const LEGACY_FAMILY_SLUG_MAP: Record<string, string> = {
  "core-story": "personal-statement",
  "identity-background": "diversity",
  "community-contribution": "community",
  "short-takes": "shorts",
  "why-school": "why-us",
  "why-major": "why-major",
  "intellectual-curiosity": "other",
  "challenge-growth": "other",
  "activities-impact": "other",
  "values-meaning": "other",
};

export const SECONDARY_TAGS = [
  "family",
  "culture",
  "service",
  "leadership",
  "creativity",
  "research",
  "entrepreneurship",
  "career goals",
  "future impact",
  "disagreement",
  "change of mind",
  "achievement",
  "responsibility",
  "interdisciplinary",
  "roommate",
  "gratitude",
  "joy",
  "books/media",
  "unusual format",
  "school-specific",
  "very short response",
  // The four retired categories, kept as internal matching signal only. No UI
  // exposes them; the import path writes them and matching reads them.
  "intellectual curiosity",
  "challenge & growth",
  "activities & impact",
  "values & meaning",
] as const;
