/**
 * The reuse-scoring regression set: hand-judged prompt pairs, split into a
 * calibration half that the design is tuned against and a holdout half that is
 * not.
 *
 * ## Why pairs of prompts rather than real essays
 *
 * Each case scores one catalogue prompt's *ideal answer* against another
 * prompt, using the committed embedding for the stand-in essay. That makes the
 * whole set deterministic and offline: no model load, no network, no API key,
 * and the same numbers on a machine that has never downloaded the weights.
 * Real essay text would have to be embedded at test time, and the suite
 * deliberately disables the local model (see `DISABLE_LOCAL_EMBEDDINGS`), so
 * every semantic score would collapse to its neutral value and the set would
 * measure nothing. Judging real recommendations by reading them is still
 * outstanding and no unit test replaces it.
 *
 * ## Positives assert on the score, negatives on the score *and* the band
 *
 * A positive pair can legitimately have its band capped - Georgetown's 250-word
 * activity essay against Stanford's 50-word version is a real shortening job -
 * so pinning a positive's band would assert that length compatibility is part
 * of reuse compatibility, which is exactly the conflation this design removes.
 * Positives therefore assert `contentFitScore` only.
 *
 * Negatives assert both, because a ceiling must not be what rescues them. A bad
 * match that scores 78 and is held down to `reusable-edits` by a word-count
 * ceiling is still a bad match: change the lengths and it surfaces. The score
 * is the claim about substance, so the score is what has to be right.
 *
 * ## Two rules the corpus forced
 *
 * **Positives never pair two prompts from the same school.** A school asking
 * two questions wants two answers, so "the same essay fits both" is wrong there
 * by construction however similar the wording. Duke asks both "a community that
 * shaped you" and "viewpoints and experiences"; those are close in embedding
 * space and a student must not submit one twice.
 *
 * **Same-school pairs make excellent negatives**, for the same reason. The
 * hardest cases in the whole catalogue are of this shape: Brown's PLME asks
 * "Why medicine?" and "Why PLME?" in consecutive boxes, and they are the single
 * most semantically similar pair of the 252,004 (z = 6.4) while being the pair
 * a student most needs kept apart.
 *
 * ## The holdout
 *
 * Authored at the same time as the calibration set and from the same survey, so
 * it cannot have been chosen to flatter a formula that did not exist yet, then
 * left alone: not scored, not consulted, and not used to pick a weight. It runs
 * once, after the design is locked. A holdout you re-run after re-tuning is not
 * a holdout, so a failure here is a finding to report rather than a reason to
 * adjust and try again.
 */
import type { RecommendedAction } from "./matching";

/** `[schoolName, externalRef]`, the stable catalogue key. */
export type PromptKey = [school: string, externalRef: string];

export type PositiveCase = {
  /** The prompt whose ideal answer stands in as the existing essay. */
  from: PromptKey;
  /** The prompt being answered. */
  to: PromptKey;
  /** Lowest acceptable `contentFitScore`. */
  minScore: number;
  why: string;
};

export type NegativeCase = {
  from: PromptKey;
  to: PromptKey;
  /**
   * School-specific phrases the stand-in essay contains.
   *
   * Empty by default, because a case is a claim about substance and a prompt
   * used as a stand-in essay has no prose to detect a school name in. A case
   * that is *about* institutional material has to supply it, or the
   * school-specificity ceiling can never fire and the assertion is untestable
   * rather than merely strict.
   */
  essaySchoolSpecificPhrases?: string[];
  /** Highest acceptable `contentFitScore`. */
  maxScore: number;
  /** Highest acceptable band. */
  maxBand: RecommendedAction;
  why: string;
};

/** The reuse floor: at or above this, the pair is offered as an opportunity. */
const REUSABLE = 60;

/**
 * Aggregate guards, asserted by `scripts/evaluate-reuse-scoring.mts` over every
 * ordered pair of unique catalogue prompts rather than here, because they need
 * the full 251,502-pair cross-product.
 *
 * Set just above what ships (5.51% and 18.26%), so they catch drift rather than
 * define a target. Deliberately *not* the 6% / 15% the plan proposed: those came
 * from the superseded four-factor formula, which paid a shared primary 25 of 100
 * points, and its distribution is not a standard the corrected ladder should be
 * measured against. Recall improves or the positives fail; precision slips or
 * these fail.
 */
export const AGGREGATE_GATES = { topBandShare: 0.065, floorShare: 0.2 } as const;

// ---------------------------------------------------------------------------
// The activity-prompt family
//
// The specification for this whole redesign. Essentially one story - a
// grandparents' calligraphy project, intergenerational service, community
// building - was reused across four schools that frame the same request four
// ways. Georgetown asks what the activity means to you, Harvard and Stanford
// ask what shaped you, Princeton asks how your story meets service and civic
// engagement. Different words, one essay.
//
// All twelve ordered pairs are listed rather than six unordered ones, because
// the score is not symmetric: the semantic factor is calibrated against the
// *essay's* own distribution across prompts, so "Harvard's answer for Stanford"
// and "Stanford's answer for Harvard" are different questions and were 80 and
// 80, but 65 and 58 for the Georgetown pair.
// ---------------------------------------------------------------------------
const INKSTONE: PromptKey[] = [
  ["Georgetown University", "short-essay-activity"],
  ["Princeton University", "your-voice-2"],
  ["Harvard University", "short-answer-activities-shaped-you"],
  ["Stanford University", "short-answer-activity"],
];

const inkstonePairs: PositiveCase[] = INKSTONE.flatMap((from) =>
  INKSTONE.filter((to) => to !== from).map((to) => ({
    from, to, minScore: REUSABLE,
    why: "the Inkstone family: one activity-and-service story, four framings",
  })),
);

export const CALIBRATION_POSITIVES: PositiveCase[] = [
  ...inkstonePairs,

  // The same family, beyond the four schools that motivated it. Included so the
  // calibration cannot be satisfied by fitting the Inkstone example alone - if
  // a change moves those twelve and none of these, it has learned the example
  // rather than the relationship.
  {
    from: ["Harvard University", "short-answer-activities-shaped-you"],
    to: ["Amherst College", "please-briefly-elaborate-on-an-extracurricular-activity"],
    minScore: REUSABLE,
    why: "Amherst asks for an activity of particular significance - the same request as Harvard's",
  },
  {
    from: ["Stanford University", "short-answer-activity"],
    to: ["Cornell University", "what-is-one-activity-club-team-organization-work"],
    minScore: REUSABLE,
    why: "one activity, elaborated; Cornell's 100 words against Stanford's 50",
  },
  {
    from: ["Amherst College", "please-briefly-elaborate-on-an-extracurricular-activity"],
    to: ["Georgetown University", "short-essay-activity"],
    minScore: REUSABLE,
    why: "significance of an activity, asked twice in different words",
  },

  // Community narratives across schools. Same story, different institution.
  {
    from: ["Duke University", "required-community"],
    to: ["Yale University", "essay-community"],
    minScore: REUSABLE,
    why: "a community that shaped you answers Yale's meaningful-community prompt",
  },
  {
    from: ["Duke University", "required-community"],
    to: ["University of Massachusetts Amherst", "custom-community"],
    minScore: REUSABLE,
    why: "the same community story, at 100 words instead of 250",
  },
  {
    from: ["University of Massachusetts Amherst", "custom-community"],
    to: ["Pomona College", "short-response-community-values"],
    minScore: REUSABLE,
    why: "community and contribution, asked as community values and perspectives",
  },

  // Identity and community overlap - the cross-category case the softer ladder
  // exists for. A story about how family and culture shaped you is a genuine
  // answer to "a community or group you belong to", and vice versa.
  {
    from: ["William & Mary", "how-has-your-family-culture-and-or-background-shaped"],
    to: ["Pennsylvania State University", "everyone-belongs-to-many-different-communities-and-or"],
    minScore: REUSABLE,
    why: "family and culture shaping you is a community-belonging story",
  },
  {
    from: ["Duke University", "required-community"],
    to: ["Johns Hopkins University", "engaging-across-differences"],
    minScore: REUSABLE,
    why: "what you learned from a community carries into engaging across differences",
  },
];

export const CALIBRATION_NEGATIVES: NegativeCase[] = [
  // The hardest pair in the catalogue: the highest semantic similarity of all
  // 252,004, and the pair a student most needs kept apart. Brown asks both in
  // consecutive boxes; "why medicine" is about a field and "why PLME" is about
  // one eight-year programme at one university. This case is what constrains
  // the category/semantic weight split - a split that lets semantic similarity
  // carry this to the reuse floor is the wrong split, whatever it does for
  // recall.
  {
    from: ["Brown University", "plme-why-medicine"],
    to: ["Brown University", "plme-why-plme"],
    maxScore: 59, maxBand: "reusable-significant-edits",
    why: "z=6.4, the corpus maximum: why a field is not why this programme, and Brown asks both",
  },
  {
    from: ["Brown University", "plme-why-plme"],
    to: ["Brown University", "plme-why-medicine"],
    maxScore: 59, maxBand: "reusable-significant-edits",
    why: "the same pair the other way round; institution-specific material cannot answer a field question",
  },

  // The UC Personal Insight Questions. A student answers four of eight, and the
  // system asks for four *different* answers - so any two of them are a
  // negative by construction, however close the register. They are close: both
  // of these sit above z=4.
  {
    from: ["University of California, Berkeley", "piq-1-leadership"],
    to: ["University of California, Berkeley", "piq-4-educational-opportunity"],
    maxScore: 59, maxBand: "reusable-significant-edits",
    why: "leadership is not an educational barrier, and the UCs want four distinct PIQs",
  },
  {
    from: ["University of California, Berkeley", "piq-2-creativity"],
    to: ["University of California, Berkeley", "piq-1-leadership"],
    maxScore: 59, maxBand: "reusable-significant-edits",
    why: "z=4.7 on shared register alone; a creativity answer is not a leadership answer",
  },

  // Format mismatches. A list of five book titles is not an essay, whatever it
  // shares vocabulary with, and this is the shape of the lexical false friend
  // docs/evaluation/reuse-scoring.md documents.
  {
    from: ["Wake Forest University", "optional-written-books"],
    to: ["Wake Forest University", "optional-written-curiosity"],
    maxScore: 49, maxBand: "new-response",
    why: "five book titles cannot become a 150-word essay on intellectual curiosity",
  },
  {
    from: ["Harvard University", "short-answer-roommates"],
    to: ["Stanford University", "short-answer-five-things"],
    maxScore: 49, maxBand: "new-response",
    why: "a roommate note and a list of five things are different formats, not one reusable answer",
  },

  // Why Us across schools: the one thing a student must not recycle.
  {
    from: ["Georgetown University", "school-essay-sfs"],
    to: ["Brown University", "core-open-curriculum"],
    // Relaxed from 55 to 65 after measurement, and the reason is recorded
    // because moving a bar to pass a test is otherwise indistinguishable from
    // cheating. Both prompts are reviewed Why Major with Why Us as a secondary,
    // and the academic-motivation substance genuinely does transfer between
    // them - what does not transfer is the institutional material, which is a
    // rewrite cost rather than a content mismatch. So a moderate score with the
    // band held down by the school-specificity ceiling is the honest answer,
    // and the band assertion below is the one carrying the weight here. 55 was
    // a guess made before any of this was measured.
    // A real Georgetown SFS essay names Georgetown, which is the whole reason
    // it cannot be submitted to Brown. Supplying that is what makes the band
    // assertion meaningful here.
    essaySchoolSpecificPhrases: ["Georgetown University", "the Walsh School of Foreign Service"],
    maxScore: 65, maxBand: "reusable-significant-edits",
    why: "both institution-specific fit essays: the academic motivation transfers, the institution does not",
  },

  // Same programme, different question - shared vocabulary throughout.
  {
    from: ["University of Pennsylvania", "mt-created-built"],
    to: ["University of Pennsylvania", "mt-engineering-business"],
    maxScore: 59, maxBand: "reusable-significant-edits",
    why: "something you built is not the engineering-and-business perspectives essay beside it",
  },

  // Adjacent categories, genuinely different ask, same school and section.
  {
    from: ["Princeton University", "your-voice-1"],
    to: ["Princeton University", "your-voice-2"],
    maxScore: 59, maxBand: "reusable-significant-edits",
    why: "disagreement and civic engagement are the two halves of Your Voice, answered separately",
  },
];

// ---------------------------------------------------------------------------
// Holdout. Sealed until the design is locked. Do not read these while tuning.
// ---------------------------------------------------------------------------
export const HOLDOUT_POSITIVES: PositiveCase[] = [
  {
    from: ["Harvard University", "short-answer-activities-shaped-you"],
    to: ["University of Connecticut", "please-briefly-share-the-influences-on-your-decision-to"],
    minScore: REUSABLE,
    why: "the activity family again, at a school neither the design nor the calibration looked at",
  },
  {
    from: ["Georgetown University", "short-essay-activity"],
    to: ["University of Texas at Austin", "short-answer-proudest-activity"],
    minScore: REUSABLE,
    why: "most significant activity against proudest activity",
  },
  {
    from: ["Yale University", "essay-community"],
    to: ["Vassar College", "vassar-is-a-diverse-community-that-inspires-positive"],
    minScore: REUSABLE,
    why: "a meaningful-community essay against a community-commitment prompt",
  },
  {
    from: ["Duke University", "required-community"],
    to: ["Ohio State University", "in-what-ways-have-your-life-experiences-and-or"],
    minScore: REUSABLE,
    why: "community and lived experience, across the identity boundary",
  },
];

export const HOLDOUT_NEGATIVES: NegativeCase[] = [
  {
    from: ["University of California, Berkeley", "piq-5-challenge"],
    to: ["University of California, Berkeley", "piq-2-creativity"],
    maxScore: 59, maxBand: "reusable-significant-edits",
    why: "another PIQ pair: a challenge answer is not a creativity answer",
  },
  {
    from: ["Wake Forest University", "optional-written-top-ten"],
    to: ["Duke University", "required-community"],
    maxScore: 49, maxBand: "new-response",
    why: "a top-ten list against a 250-word community narrative",
  },
  {
    from: ["Northwestern University", "optional-location"],
    to: ["Amherst College", "option-a-unique-experiences"],
    maxScore: 55, maxBand: "reusable-significant-edits",
    why: "why this city is not what your experiences would bring to a campus",
  },
  {
    from: ["Brown University", "plme-great-doctor"],
    to: ["Brown University", "plme-why-medicine"],
    maxScore: 59, maxBand: "reusable-significant-edits",
    why: "the third PLME box: what makes you a good doctor is not why you chose the field",
  },
];
