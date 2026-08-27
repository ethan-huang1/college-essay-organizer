// The hand-reviewed category, secondary themes, and prompt function for every
// prompt in the committed catalogue.
//
// This is the classification source of truth. It is NOT a hint to the keyword
// classifier in ../classification.ts - it replaces it for these 255 prompts.
// Two hundred and fifty-five hand judgements beat any set of regex patterns,
// and attempting to write patterns that reproduce them would reintroduce the
// accuracy problem this data solves. `classifyText` remains the classifier for
// prompts a student adds that are not in the catalogue.
//
// Static reviewed data, exactly like ./classification-overrides.ts: no model
// runs, no network request, no API key. Keyed by (schoolName, externalRef)
// because that pair is stable across re-imports, unlike the title or the
// prompt text.
//
// The seven prompts appearing identically across the UC campuses are stored
// once per campus rather than once per system, so no consumer needs to know
// about systemwide prompts. Deduplicating them is a separate change (the
// canonical_key / shared_application_key machinery), deliberately not mixed in
// here.
//
// Provenance: reviewed by the product owner in
// Essay_Prompt_Category_Review_Claude.csv (207 rows, 8 of them systemwide).
// Word limits and prompt text were deliberately NOT taken from that file - its
// word-limit column carried annotations from the review worksheet and its text
// was mojibake in places. The committed registry stays authoritative for
// wording, and rows were joined on (school, title).

/**
 * The ten primary categories in the reviewed taxonomy.
 *
 * `challenge-growth`, `reading-list` and `roommate` are new here and must be
 * added to PROMPT_FAMILIES before this data can be imported - the string union
 * is declared locally so this file compiles and can be reviewed independently
 * of that migration.
 */
export const REVIEW_PRIMARY_SLUGS = [
  "community", "diversity", "why-us", "why-major", "challenge-growth",
  "personal-statement", "shorts", "other", "reading-list", "roommate",
] as const;
export type ReviewPrimarySlug = (typeof REVIEW_PRIMARY_SLUGS)[number];

/**
 * What the prompt asks the student to *do*, as distinct from what it is about.
 *
 * Two prompts can share a topic and demand different things: "describe a
 * community that shaped you" wants reflection, "how will you contribute to our
 * community" wants a future commitment. An essay answering the first needs
 * real rewriting for the second, which is why function is scored separately
 * from category and theme.
 *
 * `state-a-future-goal` is an addition to the owner's seven-verb vocabulary.
 * Ten prompts ask what the student hopes to become or achieve, which is
 * neither growth already demonstrated nor contribution to a campus; forcing
 * them into `demonstrate-growth` would match essays about hardship already
 * overcome to prompts asking about aspiration.
 */
export const PROMPT_FUNCTIONS = [
  "describe", "reflect", "explain-impact", "demonstrate-growth",
  "explain-motivation", "discuss-future-contribution", "connect-to-school",
  "state-a-future-goal",
] as const;
export type PromptFunction = (typeof PROMPT_FUNCTIONS)[number];

/**
 * The five review secondaries that are themselves primary categories.
 *
 * These are stored as non-primary family links; the remaining twelve are
 * prompt tags. Both mechanisms already exist, so the seventeen-value secondary
 * vocabulary needs no schema change - only additional seeded tag rows.
 */
export const REVIEW_FAMILY_SECONDARIES = [
  "community", "diversity", "challenge-growth", "why-major", "why-us",
] as const;

/** The twelve review secondaries stored as tags. Five are new to the seed. */
export const REVIEW_TAG_SECONDARIES = [
  "academic context", "activities & impact", "collaboration", "contribution",
  "course", "creativity", "disagreement", "goals & future",
  "intellectual curiosity", "leadership", "service", "values & meaning",
] as const;

export type CategoryReviewRow = [
  schoolName: string,
  externalRef: string,
  primarySlug: ReviewPrimarySlug,
  secondaryFamilySlugs: string[],
  secondaryTags: string[],
  promptFunction: PromptFunction,
];

export const CATEGORY_REVIEW: CategoryReviewRow[] = [
  ["Amherst College", "option-a-curiosity", "other", [], ["intellectual curiosity", "values & meaning"], "reflect"],
  ["Amherst College", "option-a-differing-viewpoint", "diversity", [], ["disagreement"], "demonstrate-growth"],
  ["Amherst College", "option-a-unique-experiences", "diversity", [], ["contribution"], "discuss-future-contribution"],
  ["Boston College", "choice-fourth-be", "other", [], ["values & meaning", "contribution"], "reflect"],
  ["Boston College", "choice-conversation-partner", "other", [], ["values & meaning", "intellectual curiosity"], "describe"],
  ["Boston College", "choice-tradition", "community", [], ["values & meaning"], "reflect"],
  ["Boston College", "hce-common-good", "why-major", ["why-us"], ["contribution"], "connect-to-school"],
  ["Boston College", "choice-single-story", "diversity", ["challenge-growth"], [], "demonstrate-growth"],
  ["Bowdoin College", "navigating-through-differences", "diversity", [], ["disagreement"], "describe"],
  ["Bowdoin College", "offer-of-the-college", "other", [], ["values & meaning"], "reflect"],
  ["Brown University", "brown-risd-dual-degree", "why-us", ["why-major"], ["contribution", "creativity"], "connect-to-school"],
  ["Brown University", "core-growing-up", "diversity", ["challenge-growth"], ["contribution"], "reflect"],
  ["Brown University", "plme-great-doctor", "other", [], ["values & meaning", "goals & future"], "reflect"],
  ["Brown University", "plme-why-plme", "why-us", [], [], "connect-to-school"],
  ["Brown University", "plme-why-medicine", "why-major", [], [], "explain-motivation"],
  ["Brown University", "core-teach-a-class", "other", [], ["course", "intellectual curiosity"], "describe"],
  ["Brown University", "core-joy", "shorts", [], ["values & meaning"], "describe"],
  ["Brown University", "core-open-curriculum", "why-us", ["why-major"], ["intellectual curiosity", "values & meaning"], "connect-to-school"],
  ["California Institute of Technology", "fun-contribution", "other", [], ["contribution"], "discuss-future-contribution"],
  ["California Institute of Technology", "optional-academic-context", "other", [], ["academic context"], "describe"],
  ["California Institute of Technology", "academic-interest", "why-major", [], ["intellectual curiosity"], "explain-motivation"],
  ["California Institute of Technology", "scholarly-character-collaboration", "other", [], ["collaboration", "intellectual curiosity"], "demonstrate-growth"],
  ["California Institute of Technology", "scholarly-character-process", "challenge-growth", [], ["intellectual curiosity"], "reflect"],
  ["California Institute of Technology", "scientific-drive-learning", "why-major", [], ["intellectual curiosity"], "describe"],
  ["California Institute of Technology", "scientific-drive-making", "other", [], ["activities & impact", "creativity"], "describe"],
  ["California Institute of Technology", "scientific-drive-pursuing", "why-major", [], ["intellectual curiosity", "activities & impact"], "explain-motivation"],
  ["Carnegie Mellon University", "short-answer-successful-college-experience", "other", [], ["values & meaning", "goals & future"], "state-a-future-goal"],
  ["Carnegie Mellon University", "short-answer-major-inspiration", "why-major", [], ["intellectual curiosity"], "explain-motivation"],
  ["Carnegie Mellon University", "short-answer-emphasize", "other", [], [], "reflect"],
  ["Claremont McKenna College", "supplement-open-academy-dialogue", "diversity", [], ["disagreement"], "demonstrate-growth"],
  ["Claremont McKenna College", "supplement-why-cmc", "why-us", [], [], "connect-to-school"],
  ["Colorado College", "optional-deep-focus", "other", ["challenge-growth"], ["intellectual curiosity"], "describe"],
  ["Dartmouth College", "personal-impact", "other", [], ["values & meaning", "contribution", "activities & impact"], "explain-impact"],
  ["Dartmouth College", "personal-nerdy-side", "other", [], ["intellectual curiosity"], "describe"],
  ["Dartmouth College", "fit", "why-us", [], [], "connect-to-school"],
  ["Dartmouth College", "personal-difference", "diversity", [], ["values & meaning"], "reflect"],
  ["Dartmouth College", "personal-dialogue", "diversity", [], ["disagreement"], "describe"],
  ["Dartmouth College", "personal-reading", "other", [], ["intellectual curiosity", "values & meaning"], "demonstrate-growth"],
  ["Dartmouth College", "introduce-yourself", "personal-statement", [], [], "reflect"],
  ["Dartmouth College", "personal-excitement", "other", [], ["intellectual curiosity"], "describe"],
  ["Dartmouth College", "introduce-environment", "community", ["diversity"], [], "reflect"],
  ["Davidson College", "intellectual-curiosity", "why-major", [], ["intellectual curiosity"], "describe"],
  ["Davidson College", "why-davidson", "why-us", [], [], "connect-to-school"],
  ["Duke University", "required-community", "community", [], ["contribution"], "reflect"],
  ["Duke University", "optional-disagreement", "diversity", [], ["disagreement"], "demonstrate-growth"],
  ["Duke University", "optional-excitement", "shorts", [], ["intellectual curiosity"], "describe"],
  ["Duke University", "optional-viewpoints", "diversity", [], ["contribution"], "reflect"],
  ["Duke University", "required-why-duke", "why-us", ["why-major"], ["values & meaning"], "connect-to-school"],
  ["Georgetown University", "short-essay-differing-viewpoint", "diversity", [], ["disagreement"], "demonstrate-growth"],
  ["Georgetown University", "short-essay-activity", "other", [], ["activities & impact"], "reflect"],
  ["Georgetown University", "essay-personal-creative", "personal-statement", [], [], "reflect"],
  ["Georgetown University", "school-essay-nursing", "why-major", [], ["values & meaning"], "explain-motivation"],
  ["Georgetown University", "school-essay-college-arts-sciences", "why-major", ["why-us"], [], "explain-motivation"],
  ["Georgetown University", "school-essay-earth-commons", "why-major", [], ["contribution", "goals & future"], "explain-motivation"],
  ["Georgetown University", "school-essay-mccourt", "why-major", ["why-us"], ["service"], "explain-motivation"],
  ["Georgetown University", "school-essay-mcdonough", "why-major", [], ["values & meaning"], "explain-motivation"],
  ["Georgetown University", "school-essay-health", "why-major", [], ["goals & future"], "explain-motivation"],
  ["Georgetown University", "school-essay-sfs", "why-major", ["why-us"], ["service"], "explain-motivation"],
  ["Harvard University", "short-answer-disagreement", "diversity", [], ["disagreement"], "demonstrate-growth"],
  ["Harvard University", "short-answer-activities-shaped-you", "other", [], ["activities & impact"], "describe"],
  ["Harvard University", "short-answer-life-experiences", "diversity", [], ["contribution"], "discuss-future-contribution"],
  ["Harvard University", "short-answer-roommates", "roommate", [], [], "describe"],
  ["Harvard University", "short-answer-future-use", "other", [], ["goals & future", "contribution"], "state-a-future-goal"],
  ["Harvey Mudd College", "asking-for-help", "challenge-growth", [], ["collaboration"], "demonstrate-growth"],
  ["Harvey Mudd College", "impact-problems-and-community", "other", ["community"], ["values & meaning", "contribution"], "explain-motivation"],
  ["Haverford College", "community-values-and-honor-code", "why-us", ["community"], ["values & meaning"], "connect-to-school"],
  ["Haverford College", "intellectual-curiosity-at-haverford", "why-major", ["why-us"], ["intellectual curiosity"], "connect-to-school"],
  ["Johns Hopkins University", "engaging-across-differences", "diversity", [], ["disagreement", "contribution"], "demonstrate-growth"],
  ["Massachusetts Institute of Technology", "short-answer-topic", "other", [], ["intellectual curiosity"], "describe"],
  ["Massachusetts Institute of Technology", "essay-unexpected-challenge", "challenge-growth", [], [], "demonstrate-growth"],
  ["Massachusetts Institute of Technology", "essay-field-of-study", "why-major", [], ["intellectual curiosity"], "explain-motivation"],
  ["Massachusetts Institute of Technology", "short-answer-generalist", "other", [], ["intellectual curiosity", "values & meaning"], "reflect"],
  ["Massachusetts Institute of Technology", "short-answer-fun", "shorts", [], [], "describe"],
  ["Massachusetts Institute of Technology", "essay-mit-impact", "why-major", ["why-us"], ["contribution"], "explain-motivation"],
  ["Massachusetts Institute of Technology", "short-answer-admire", "other", [], ["values & meaning"], "describe"],
  ["Massachusetts Institute of Technology", "essay-own-trail", "challenge-growth", [], ["academic context"], "describe"],
  ["New York University", "bridge-builders", "diversity", [], ["disagreement", "contribution"], "reflect"],
  ["North Carolina State University", "honors-curiosity-to-action", "other", [], ["intellectual curiosity", "activities & impact"], "explain-impact"],
  ["North Carolina State University", "required-major-interest", "why-major", ["why-us"], [], "connect-to-school"],
  ["Northwestern University", "optional-interdisciplinary-project", "other", [], ["course", "intellectual curiosity", "collaboration"], "discuss-future-contribution"],
  ["Northwestern University", "optional-community-belonging", "why-us", ["community"], [], "connect-to-school"],
  ["Northwestern University", "optional-diverse-perspectives", "diversity", [], ["contribution"], "discuss-future-contribution"],
  ["Northwestern University", "optional-location", "why-us", [], [], "connect-to-school"],
  ["Northwestern University", "optional-the-rock", "other", [], ["values & meaning", "contribution"], "connect-to-school"],
  ["Northwestern University", "required-personal-context", "diversity", ["why-us"], ["contribution"], "connect-to-school"],
  ["Oberlin College", "babfa-influences", "other", [], ["creativity", "intellectual curiosity"], "describe"],
  ["Oberlin College", "babfa-vision", "why-major", ["why-us"], ["creativity"], "connect-to-school"],
  ["Oberlin College", "composition-aspirations", "why-major", ["why-us"], ["goals & future"], "state-a-future-goal"],
  ["Oberlin College", "composition-development", "why-major", [], ["intellectual curiosity", "creativity"], "describe"],
  ["Oberlin College", "timara-goals", "why-major", [], ["goals & future", "creativity"], "state-a-future-goal"],
  ["Pitzer College", "core-values", "other", [], ["values & meaning", "contribution", "activities & impact"], "explain-impact"],
  ["Pitzer College", "college-fit", "why-us", [], ["activities & impact", "creativity"], "connect-to-school"],
  ["Pomona College", "academic-interest", "why-major", [], ["intellectual curiosity"], "explain-motivation"],
  ["Pomona College", "short-response-outside-classroom", "other", ["challenge-growth"], ["disagreement"], "demonstrate-growth"],
  ["Pomona College", "short-response-community-values", "community", [], ["values & meaning", "contribution"], "discuss-future-contribution"],
  ["Pomona College", "short-response-how-others-see-you", "other", ["diversity"], [], "describe"],
  ["Princeton University", "academic-interest-ab", "why-major", ["why-us"], ["intellectual curiosity"], "connect-to-school"],
  ["Princeton University", "academic-interest-bse", "why-major", ["why-us"], ["activities & impact"], "connect-to-school"],
  ["Princeton University", "more-about-you-skill", "shorts", [], ["intellectual curiosity"], "state-a-future-goal"],
  ["Princeton University", "more-about-you-song", "shorts", [], [], "describe"],
  ["Princeton University", "more-about-you-joy", "shorts", [], [], "describe"],
  ["Princeton University", "your-voice-1", "diversity", [], ["disagreement", "contribution"], "discuss-future-contribution"],
  ["Princeton University", "your-voice-2", "other", [], ["service", "contribution", "values & meaning"], "reflect"],
  ["Reed College", "paideia-class", "other", [], ["course", "intellectual curiosity", "contribution"], "discuss-future-contribution"],
  ["Rice University", "academic-areas", "why-major", ["why-us"], [], "connect-to-school"],
  ["Rice University", "community-change-agents", "diversity", [], ["contribution"], "explain-motivation"],
  ["Rice University", "community-residential-college", "diversity", [], ["contribution"], "discuss-future-contribution"],
  ["Rice University", "rice-experience", "why-us", [], [], "connect-to-school"],
  ["Stanford University", "short-answer-activity", "other", [], ["activities & impact"], "describe"],
  ["Stanford University", "short-essay-contribution", "diversity", [], ["contribution"], "discuss-future-contribution"],
  ["Stanford University", "short-answer-five-things", "shorts", [], ["values & meaning"], "describe"],
  ["Stanford University", "short-essay-learning", "why-major", [], ["intellectual curiosity"], "reflect"],
  ["Stanford University", "short-answer-historical-moment", "shorts", [], ["intellectual curiosity"], "describe"],
  ["Stanford University", "short-answer-summers", "shorts", [], [], "describe"],
  ["Stanford University", "short-essay-roommate", "roommate", [], [], "describe"],
  ["Stanford University", "short-answer-challenge", "other", [], ["values & meaning", "intellectual curiosity"], "describe"],
  ["Texas A&M University", "college-readiness", "challenge-growth", [], [], "demonstrate-growth"],
  ["Texas A&M University", "additional-context", "challenge-growth", [], [], "describe"],
  ["Texas A&M University", "life-goals", "shorts", [], ["goals & future"], "state-a-future-goal"],
  ["Texas A&M University", "education-plans", "other", [], ["goals & future"], "state-a-future-goal"],
  ["Texas A&M University", "why-tamu", "why-us", [], [], "connect-to-school"],
  ["Texas A&M University", "major-choice", "why-major", [], [], "explain-motivation"],
  ["Texas A&M University", "personal-story", "challenge-growth", ["diversity"], [], "demonstrate-growth"],
  ["Trinity College", "background-at-trinity", "diversity", [], ["contribution"], "discuss-future-contribution"],
  ["Tufts University", "arts-sciences-assignment", "other", [], ["intellectual curiosity"], "describe"],
  ["Tufts University", "bfa-portfolio-piece", "other", [], ["creativity"], "describe"],
  ["Tufts University", "engineering-project", "other", [], ["activities & impact", "creativity"], "describe"],
  ["Tufts University", "college-search-engagement", "why-us", [], [], "connect-to-school"],
  ["Tufts University", "combined-degree-portfolio", "why-major", [], ["creativity", "intellectual curiosity"], "describe"],
  ["University of California, Berkeley", "piq-1-leadership", "other", [], ["leadership", "contribution"], "explain-impact"],
  ["University of California, Berkeley", "piq-2-creativity", "other", [], ["creativity"], "describe"],
  ["University of California, Berkeley", "piq-3-talent", "other", [], ["activities & impact"], "explain-impact"],
  ["University of California, Berkeley", "piq-4-educational-opportunity", "challenge-growth", [], ["academic context"], "demonstrate-growth"],
  ["University of California, Berkeley", "piq-5-challenge", "challenge-growth", [], [], "demonstrate-growth"],
  ["University of California, Berkeley", "piq-6-academic-interest", "why-major", [], ["intellectual curiosity"], "explain-impact"],
  ["University of California, Berkeley", "piq-7-community", "other", [], ["contribution"], "explain-impact"],
  ["University of California, Berkeley", "piq-8-strong-candidate", "other", [], [], "reflect"],
  ["University of California, Davis", "piq-1-leadership", "other", [], ["leadership", "contribution"], "explain-impact"],
  ["University of California, Davis", "piq-2-creativity", "other", [], ["creativity"], "describe"],
  ["University of California, Davis", "piq-3-talent", "other", [], ["activities & impact"], "explain-impact"],
  ["University of California, Davis", "piq-4-educational-opportunity", "challenge-growth", [], ["academic context"], "demonstrate-growth"],
  ["University of California, Davis", "piq-5-challenge", "challenge-growth", [], [], "demonstrate-growth"],
  ["University of California, Davis", "piq-6-academic-interest", "why-major", [], ["intellectual curiosity"], "explain-impact"],
  ["University of California, Davis", "piq-7-community", "other", [], ["contribution"], "explain-impact"],
  ["University of California, Davis", "piq-8-strong-candidate", "other", [], [], "reflect"],
  ["University of California, Irvine", "piq-1-leadership", "other", [], ["leadership", "contribution"], "explain-impact"],
  ["University of California, Irvine", "piq-2-creativity", "other", [], ["creativity"], "describe"],
  ["University of California, Irvine", "piq-3-talent", "other", [], ["activities & impact"], "explain-impact"],
  ["University of California, Irvine", "piq-4-educational-opportunity", "challenge-growth", [], ["academic context"], "demonstrate-growth"],
  ["University of California, Irvine", "piq-5-challenge", "challenge-growth", [], [], "demonstrate-growth"],
  ["University of California, Irvine", "piq-6-academic-interest", "why-major", [], ["intellectual curiosity"], "explain-impact"],
  ["University of California, Irvine", "piq-7-community", "other", [], ["contribution"], "explain-impact"],
  ["University of California, Irvine", "piq-8-strong-candidate", "other", [], [], "reflect"],
  ["University of California, Los Angeles", "piq-1-leadership", "other", [], ["leadership", "contribution"], "explain-impact"],
  ["University of California, Los Angeles", "piq-2-creativity", "other", [], ["creativity"], "describe"],
  ["University of California, Los Angeles", "piq-3-talent", "other", [], ["activities & impact"], "explain-impact"],
  ["University of California, Los Angeles", "piq-4-educational-opportunity", "challenge-growth", [], ["academic context"], "demonstrate-growth"],
  ["University of California, Los Angeles", "piq-5-challenge", "challenge-growth", [], [], "demonstrate-growth"],
  ["University of California, Los Angeles", "piq-6-academic-interest", "why-major", [], ["intellectual curiosity"], "explain-impact"],
  ["University of California, Los Angeles", "piq-7-community", "other", [], ["contribution"], "explain-impact"],
  ["University of California, Los Angeles", "piq-8-strong-candidate", "other", [], [], "reflect"],
  ["University of California, San Diego", "piq-1-leadership", "other", [], ["leadership", "contribution"], "explain-impact"],
  ["University of California, San Diego", "piq-2-creativity", "other", [], ["creativity"], "describe"],
  ["University of California, San Diego", "piq-3-talent", "other", [], ["activities & impact"], "explain-impact"],
  ["University of California, San Diego", "piq-4-educational-opportunity", "challenge-growth", [], ["academic context"], "demonstrate-growth"],
  ["University of California, San Diego", "piq-5-challenge", "challenge-growth", [], [], "demonstrate-growth"],
  ["University of California, San Diego", "piq-6-academic-interest", "why-major", [], ["intellectual curiosity"], "explain-impact"],
  ["University of California, San Diego", "piq-7-community", "other", [], ["contribution"], "explain-impact"],
  ["University of California, San Diego", "piq-8-strong-candidate", "other", [], [], "reflect"],
  ["University of California, Santa Barbara", "piq-1-leadership", "other", [], ["leadership", "contribution"], "explain-impact"],
  ["University of California, Santa Barbara", "piq-2-creativity", "other", [], ["creativity"], "describe"],
  ["University of California, Santa Barbara", "piq-3-talent", "other", [], ["activities & impact"], "explain-impact"],
  ["University of California, Santa Barbara", "piq-4-educational-opportunity", "challenge-growth", [], ["academic context"], "demonstrate-growth"],
  ["University of California, Santa Barbara", "piq-5-challenge", "challenge-growth", [], [], "demonstrate-growth"],
  ["University of California, Santa Barbara", "piq-6-academic-interest", "why-major", [], ["intellectual curiosity"], "explain-impact"],
  ["University of California, Santa Barbara", "piq-7-community", "other", [], ["contribution"], "explain-impact"],
  ["University of California, Santa Barbara", "piq-8-strong-candidate", "other", [], [], "reflect"],
  ["University of California, Santa Cruz", "piq-1-leadership", "other", [], ["leadership", "contribution"], "explain-impact"],
  ["University of California, Santa Cruz", "piq-2-creativity", "other", [], ["creativity"], "describe"],
  ["University of California, Santa Cruz", "piq-3-talent", "other", [], ["activities & impact"], "explain-impact"],
  ["University of California, Santa Cruz", "piq-4-educational-opportunity", "challenge-growth", [], ["academic context"], "demonstrate-growth"],
  ["University of California, Santa Cruz", "piq-5-challenge", "challenge-growth", [], [], "demonstrate-growth"],
  ["University of California, Santa Cruz", "piq-6-academic-interest", "why-major", [], ["intellectual curiosity"], "explain-impact"],
  ["University of California, Santa Cruz", "piq-7-community", "other", [], ["contribution"], "explain-impact"],
  ["University of California, Santa Cruz", "piq-8-strong-candidate", "other", [], [], "reflect"],
  ["University of Colorado Boulder", "short-answer-academic-interest", "why-major", [], ["intellectual curiosity"], "explain-motivation"],
  ["University of Illinois Urbana-Champaign", "first-choice-major-goals", "why-major", [], ["goals & future"], "state-a-future-goal"],
  ["University of Illinois Urbana-Champaign", "first-choice-major-experience", "why-major", [], ["activities & impact"], "describe"],
  ["University of Illinois Urbana-Champaign", "second-choice-major-interest", "why-major", [], ["goals & future"], "explain-motivation"],
  ["University of Illinois Urbana-Champaign", "undeclared-academic-interests", "why-major", [], [], "describe"],
  ["University of Illinois Urbana-Champaign", "undeclared-future-goals", "why-major", [], ["goals & future"], "state-a-future-goal"],
  ["University of Massachusetts Amherst", "custom-community", "community", [], ["contribution"], "discuss-future-contribution"],
  ["University of Massachusetts Amherst", "custom-why-umass", "why-us", [], [], "connect-to-school"],
  ["University of Massachusetts Amherst", "custom-why-major", "why-major", [], [], "explain-motivation"],
  ["University of Michigan", "leaders-and-citizens", "other", [], ["contribution", "leadership", "goals & future"], "discuss-future-contribution"],
  ["University of Michigan", "specific-school-fit", "why-us", ["why-major"], [], "connect-to-school"],
  ["University of Notre Dame", "required-non-negotiables", "other", ["why-us"], ["values & meaning"], "describe"],
  ["University of Notre Dame", "choice-personal-experiences", "diversity", [], ["contribution"], "discuss-future-contribution"],
  ["University of Notre Dame", "choice-faith", "other", ["diversity"], ["values & meaning"], "reflect"],
  ["University of Notre Dame", "choice-service", "other", [], ["service", "contribution"], "explain-impact"],
  ["University of Notre Dame", "choice-fight-for", "other", [], ["values & meaning"], "reflect"],
  ["University of Pennsylvania", "all-community", "why-us", ["diversity"], ["contribution"], "connect-to-school"],
  ["University of Pennsylvania", "huntsman-global-issue", "why-major", ["why-us"], ["contribution"], "explain-motivation"],
  ["University of Pennsylvania", "huntsman-language-experience", "why-major", ["diversity"], ["intellectual curiosity"], "describe"],
  ["University of Pennsylvania", "lsm-integration", "why-major", ["why-us"], ["intellectual curiosity"], "connect-to-school"],
  ["University of Pennsylvania", "mt-engineering-business", "why-us", ["why-major"], ["goals & future"], "connect-to-school"],
  ["University of Pennsylvania", "mt-created-built", "other", [], ["activities & impact", "creativity"], "describe"],
  ["University of Pennsylvania", "nhcm-interest", "why-major", ["why-us"], ["goals & future"], "connect-to-school"],
  ["University of Pennsylvania", "school-arts-sciences", "why-major", ["why-us"], ["intellectual curiosity"], "connect-to-school"],
  ["University of Pennsylvania", "school-engineering", "why-major", ["why-us"], [], "connect-to-school"],
  ["University of Pennsylvania", "school-nursing", "why-major", ["why-us"], ["contribution", "goals & future"], "connect-to-school"],
  ["University of Pennsylvania", "school-wharton", "why-major", ["why-us"], ["intellectual curiosity"], "connect-to-school"],
  ["University of Pennsylvania", "all-thank-you-note", "other", [], ["values & meaning"], "describe"],
  ["University of Pennsylvania", "vic-alignment", "why-major", ["why-us"], [], "connect-to-school"],
  ["University of Pennsylvania", "viper-energy-interest", "why-major", ["why-us"], ["goals & future"], "connect-to-school"],
  ["University of Pennsylvania", "viper-major-combination", "why-major", ["why-us"], [], "explain-motivation"],
  ["University of Richmond", "relentlessly-welcoming", "other", [], ["contribution"], "explain-impact"],
  ["University of Richmond", "ideas-into-actions", "other", ["challenge-growth"], ["activities & impact", "contribution"], "demonstrate-growth"],
  ["University of Richmond", "unique-spider", "diversity", [], ["contribution"], "reflect"],
  ["University of Rochester", "curiosity-creativity", "why-us", ["why-major"], ["intellectual curiosity"], "connect-to-school"],
  ["University of Texas at Austin", "short-answer-academic-circumstances", "challenge-growth", [], ["academic context"], "describe"],
  ["University of Texas at Austin", "short-answer-first-choice-major", "why-major", [], [], "explain-motivation"],
  ["University of Texas at Austin", "short-answer-proudest-activity", "other", [], ["activities & impact"], "reflect"],
  ["University of Texas at Austin", "short-answer-architecture", "why-major", [], ["values & meaning", "goals & future"], "reflect"],
  ["University of Texas at Austin", "short-answer-nursing", "why-major", [], ["activities & impact", "goals & future"], "explain-motivation"],
  ["Vanderbilt University", "short-answer-dare-to-grow", "diversity", ["challenge-growth"], ["contribution"], "demonstrate-growth"],
  ["Villanova University", "supplement-life-lesson", "other", [], ["values & meaning"], "reflect"],
  ["Villanova University", "supplement-equity-justice", "other", [], ["contribution", "service"], "explain-impact"],
  ["Villanova University", "supplement-borrowed-strength", "other", [], ["contribution", "values & meaning"], "explain-impact"],
  ["Villanova University", "supplement-ai-common-good", "other", [], ["values & meaning", "contribution"], "discuss-future-contribution"],
  ["Villanova University", "supplement-new-home", "why-us", [], [], "connect-to-school"],
  ["Wake Forest University", "optional-written-maya-angelou", "other", [], ["values & meaning", "contribution"], "reflect"],
  ["Wake Forest University", "optional-written-books", "reading-list", [], [], "describe"],
  ["Wake Forest University", "optional-written-curiosity", "why-major", [], ["intellectual curiosity"], "describe"],
  ["Wake Forest University", "optional-written-top-ten", "shorts", [], [], "describe"],
  ["Wake Forest University", "required-why-wake", "why-us", [], [], "connect-to-school"],
  ["Washington and Lee University", "optional-short-answer-diversity", "diversity", [], ["contribution"], "discuss-future-contribution"],
  ["Washington and Lee University", "johnson-art", "other", [], ["intellectual curiosity", "values & meaning"], "demonstrate-growth"],
  ["Washington and Lee University", "johnson-unexpected-path", "challenge-growth", [], [], "demonstrate-growth"],
  ["Washington and Lee University", "johnson-authentic-representation", "other", ["diversity", "challenge-growth"], [], "demonstrate-growth"],
  ["Washington and Lee University", "johnson-spring-term", "other", [], ["course", "intellectual curiosity"], "discuss-future-contribution"],
  ["Washington and Lee University", "johnson-education-social-framework", "community", [], ["values & meaning", "contribution"], "reflect"],
  ["Washington and Lee University", "optional-short-answer-life-outside-school", "other", [], ["activities & impact", "contribution"], "demonstrate-growth"],
  ["Washington and Lee University", "optional-short-answer-name", "diversity", [], [], "describe"],
  ["Washington and Lee University", "optional-why-wlu", "why-us", [], [], "connect-to-school"],
  ["Washington and Lee University", "optional-short-answer-curiosity", "why-major", [], ["intellectual curiosity"], "describe"],
  ["Wellesley College", "required-bridges-perspectives", "diversity", [], ["disagreement", "contribution"], "demonstrate-growth"],
  ["Yale University", "short-answer-topic-excites", "why-major", [], ["intellectual curiosity"], "describe"],
  ["Yale University", "short-answer-academic-interests", "why-major", [], ["intellectual curiosity"], "describe"],
  ["Yale University", "essay-community", "community", [], [], "reflect"],
  ["Yale University", "essay-opposing-view", "diversity", [], ["disagreement"], "reflect"],
  ["Yale University", "essay-personal-experience", "diversity", [], ["contribution"], "reflect"],
  ["Yale University", "short-take-grow-develop", "other", ["challenge-growth"], ["values & meaning"], "state-a-future-goal"],
  ["Yale University", "short-take-not-elsewhere", "shorts", [], [], "describe"],
  ["Yale University", "short-take-teach-write-create", "shorts", [], ["course", "creativity"], "describe"],];

// Same printable separator as ./classification-overrides.ts: school names
// contain spaces and commas, externalRefs are kebab-case, so "|" cannot appear
// in either half.
const BY_KEY = new Map<string, CategoryReviewRow>(
  CATEGORY_REVIEW.map((row) => [`${row[0]}|${row[1]}`, row]),
);

/** The reviewed classification for one catalogue prompt, or null if unreviewed. */
export function categoryReview(schoolName: string, externalRef: string | null): CategoryReviewRow | null {
  if (!externalRef) return null;
  return BY_KEY.get(`${schoolName}|${externalRef}`) ?? null;
}
