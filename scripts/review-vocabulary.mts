/**
 * The display-name vocabulary the review worksheet is written in, and the
 * mapping to and from the slugs the app stores.
 *
 * One copy, imported by both `build-prompt-review.mts` (which writes the
 * worksheet) and `regenerate-category-review.mts` (which reads it back). These
 * maps used to live only in the regenerate script, so the worksheet and the
 * parser could disagree about what "Values" means and nothing would notice
 * until a row threw.
 *
 * Secondaries split two ways because the schema stores them two ways: six are
 * themselves categories and land in `prompt_family_links` as non-primary rows,
 * the rest are `prompt_tags`. A reviewer writes one list and does not need to
 * know which is which.
 */

/** Reviewer-facing name -> the primary category slug. */
export const PRIMARY_TO_SLUG: Record<string, string> = {
  "Community": "community",
  "Background & Identity": "diversity",
  "Why Us": "why-us",
  "Why Major": "why-major",
  "Challenge & Growth": "challenge-growth",
  "Activities & Impact": "activities-impact",
  "Personal Statement": "personal-statement",
  "Short Answer": "shorts",
  "Other": "other",
  "Reading List": "reading-list",
  "Roommate": "roommate",
};

/** Secondaries that are themselves categories, stored as non-primary family links. */
export const SECONDARY_FAMILY: Record<string, string> = {
  "Background & Identity": "diversity",
  "Challenge & Growth": "challenge-growth",
  "Community": "community",
  "Why Major": "why-major",
  "Why Us": "why-us",
  "Activities & Impact": "activities-impact",
};

/** Secondaries stored as prompt tags. */
export const SECONDARY_TAG: Record<string, string> = {
  "Academic Context": "academic context",
  "Collaboration": "collaboration",
  "Contribution": "contribution",
  "Course": "course",
  "Creativity": "creativity",
  "Disagreement": "disagreement",
  "Goals & Future": "goals & future",
  "Intellectual Curiosity": "intellectual curiosity",
  "Leadership": "leadership",
  "Service": "service",
  "Values": "values & meaning",
};

const invert = (map: Record<string, string>) =>
  Object.fromEntries(Object.entries(map).map(([name, slug]) => [slug, name]));

export const SLUG_TO_PRIMARY = invert(PRIMARY_TO_SLUG);
/**
 * Slug -> reviewer name for secondaries, families first.
 *
 * The two sub-vocabularies overlap on nothing, so one merged inverse is
 * unambiguous - but families are inverted last on purpose, because a name like
 * "Community" must round-trip to the family slug rather than to a tag.
 */
export const SLUG_TO_SECONDARY: Record<string, string> = {
  ...invert(SECONDARY_TAG),
  ...invert(SECONDARY_FAMILY),
};

/** The eight prompt functions, written as-is in the worksheet. */
export const FUNCTION_NAMES = [
  "describe", "reflect", "explain-impact", "demonstrate-growth",
  "explain-motivation", "discuss-future-contribution", "connect-to-school",
  "state-a-future-goal",
] as const;

/** `a; b; c` - semicolons, because reviewer names contain commas and ampersands. */
export const SECONDARY_SEPARATOR = ";";

export const joinSecondaries = (names: string[]) => names.join(`${SECONDARY_SEPARATOR} `);
export const splitSecondaries = (cell: string) =>
  cell.split(SECONDARY_SEPARATOR).map((part) => part.trim()).filter(Boolean);

/**
 * The unique-prompt identity: normalised title plus text.
 *
 * Lives here rather than in the worksheet builder because the regenerate script
 * needs it too, and importing it from the builder re-ran the builder's top
 * level - so reading the worksheet rewrote it as a side effect.
 *
 * Title is included because two prompts can share a body and differ in framing,
 * and normalising whitespace and case means a reflowed paragraph in the
 * research master does not read as a new prompt.
 */
export const signatureOf = (title: string, text: string) =>
  `${title}||${text}`.toLowerCase().replace(/\s+/g, " ").trim();
