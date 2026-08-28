// The ten categories a student sorts supplemental essays into.
//
// History worth knowing before editing this list. MVP_SPEC.md section 2
// originally specified ten; those were collapsed to seven because the list
// mixed how a student groups their own work ("this is my Why Us essay") with
// themes a reader might notice in it ("this one is about values"). That was the
// right correction for four of them and the wrong one for Challenge & Growth,
// which is a kind of essay a student writes deliberately, not a theme someone
// notices afterwards. A review of all 255 catalogue prompts put 23 of them
// there (see ../retrieval/category-review.ts), so it is back as a primary.
//
// Reading List and Roommate are new and narrow on purpose: "list five books
// that intrigued you" and "write a note to your future roommate" are specific,
// recurring prompt types whose essays are reusable only against each other.
// Filing them under Short Answer made a 250-word roommate note look
// interchangeable with a 50-word favourite-song answer.
//
// Personal Statement is NOT a catch-all. It means "choose essentially any
// topic you want", which is true of exactly 2 of the 255 catalogue prompts. A
// broad, reflective prompt about community belongs in Community. Letting it
// drift back is what made any two of 106 prompts read as a strong match.
//
// Order is the seed's sortOrder. Other is deliberately last: a real category
// for prompts that genuinely fit nowhere else, NOT a "needs attention" bucket.
// Whether a classification needs review is a separate question, answered by
// prompts.classificationConfidence.
export const PROMPT_FAMILIES = [
  ["community", "Community", "A community or group you belong to, how it shaped you, and what you would bring to a new one.", "#59644d"],
  ["diversity", "Identity & Background", "Culture, family, upbringing, identity, lived experience, and formative environment.", "#9a6048"],
  ["challenge-growth", "Challenge & Growth", "A concrete obstacle, barrier, setback, or unexpected path, and what you did about it.", "#7d5a3c"],
  ["activities-impact", "Activities & Impact", "An activity, role, job, or sustained involvement: what you did, and what came of it.", "#4d6273"],
  ["why-major", "Why Major", "Academic interests, intended field of study, and reasons for pursuing it.", "#56617a"],
  ["why-us", "Why Us", "Institutional fit: specific programs, resources, culture, location, and intended contribution.", "#8a493f"],
  ["personal-statement", "Personal Statement", "Genuinely open-topic prompts: you choose what to write about. Rare, and not a fallback.", "#7b403c"],
  ["shorts", "Short Answer", "Lists, favourites, and other short-form or character-limited responses.", "#3f6b65"],
  ["roommate", "Roommate", "Notes to a future roommate: what living alongside you is actually like.", "#4a6b58"],
  ["reading-list", "Reading List", "Books, films, and other works you list rather than write an essay about.", "#5d5470"],
  ["other", "Other", "Prompts with a bespoke framing that fits none of the categories above. A real category, not a to-do list.", "#6c5b51"],
] as const;

// Concepts that carry real reuse signal but are not categories a student sorts
// into. The classifier derives them from text and the import path records them
// as internal tags. There is no UI for these.
//
// `challenge-growth` and `activities-impact` both used to be in this list and
// are not any more: each is a primary category (see PROMPT_FAMILIES). Leaving
// one here as well would record the same fact in two places, and matching would
// then double-count it - once as a shared category and again as a shared tag.
//
// Being a primary does not stop a concept being someone else's *secondary*.
// Activities & Impact is the secondary on nine prompts whose central request is
// something else, and those are stored as non-primary family links, exactly as
// Community and Why Us already are.
export const DERIVED_CONCEPT_TAGS = [
  "intellectual-curiosity",
  "values-meaning",
] as const;

// How a pre-existing workspace's retired categories map onto internal tags.
// Every link row is repointed rather than deleted, so no student loses a
// classification; the three that collapse into `other` also gain the tag above.
export const RETIRED_FAMILY_SLUGS: Record<string, (typeof DERIVED_CONCEPT_TAGS)[number]> = {
  "intellectual-curiosity": "intellectual-curiosity",
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
  // Not "other" any more. A workspace still on the original ten keeps its
  // Challenge & Growth classifications intact rather than having them
  // collapsed and then rebuilt from the catalogue review.
  "challenge-growth": "challenge-growth",
  // Not "other" any more, for the same reason as challenge-growth above: a
  // workspace still on the original ten keeps its Activities & Impact
  // classifications where they are instead of having them collapsed and rebuilt.
  "activities-impact": "activities-impact",
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
  // Internal matching signal only. No UI exposes these; the import path writes
  // them and matching reads them.
  //
  // "challenge & growth" and "activities & impact" stay in this list even
  // though both are primary categories again, because production workspaces
  // already hold rows with those names and dropping them from the seed would
  // orphan them. Nothing writes either any more.
  "intellectual curiosity",
  "challenge & growth",
  "activities & impact",
  "values & meaning",
  // The five secondary themes the catalogue review uses that had no tag yet.
  // The other seven of its twelve tag secondaries are already above.
  "academic context",
  "collaboration",
  "contribution",
  "course",
  "goals & future",
] as const;
