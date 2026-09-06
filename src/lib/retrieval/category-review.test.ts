import { describe, expect, it } from "vitest";

import { classifyUnreviewedPrompt } from "../classification";
import {
  CATEGORY_REVIEW,
  PROMPT_FUNCTIONS,
  REVIEW_FAMILY_SECONDARIES,
  REVIEW_PRIMARY_SLUGS,
  REVIEW_TAG_SECONDARIES,
  categoryReview,
} from "./category-review";
import { listCoveredSchoolNames, lookupSchoolSource } from "./registry";

/**
 * The review data is the classification source of truth for the prompts it
 * covers, which is no longer the whole catalogue: the 2026-27 rebuild took the
 * catalogue from 255 prompts to 553, and the 303 it added have not been
 * reviewed yet (docs/evaluation/prompt-review.csv is the worksheet for
 * them). So the assertions here are about the review being *sound* rather than
 * total - every row points at a live prompt, no prompt has two rows, and the
 * distribution the reuse weights were chosen against has not moved - plus a
 * pinned count of what is still unreviewed so it cannot grow unnoticed.
 */
describe("category review coverage", () => {
  // Essay prompts only. Supporting-material requirements - graded papers,
  // writing samples, a caption per portfolio item - are imported and tracked
  // but have no essay category, so the review deliberately does not cover
  // them and `qa-catalogue.mts` asserts they carry none.
  const catalogue = listCoveredSchoolNames().flatMap((schoolName) => {
    const record = lookupSchoolSource(schoolName);
    return (record?.prompts ?? [])
      .filter((prompt) => !prompt.supportingMaterial)
      .map((prompt) => ({ schoolName, prompt }));
  });

  it("covers every essay prompt, with nothing left unreviewed", () => {
    const unreviewed = catalogue.filter(({ schoolName, prompt }) => !categoryReview(schoolName, prompt.externalRef));
    expect(catalogue).toHaveLength(525);
    // Zero, and it must stay zero. An unreviewed prompt falls through to the
    // keyword classifier, and 153 of the 303 the rebuild added got no primary
    // at all from it - so they resolved to `other`, which earns no category
    // credit. That is invisible in the data: it looks like a classification
    // rather than the absence of one. A catalogue rebuild that adds prompts
    // fails here until docs/evaluation/prompt-review.csv covers them.
    expect(unreviewed).toEqual([]);
  });

  it("never lets an unreviewed prompt be classified Personal Statement", () => {
    // The fallback withholds that category (see classifyUnreviewedPrompt); this
    // asserts the catalogue-wide consequence rather than the unit behaviour,
    // because a catch-all Personal Statement is what degrades reuse scoring.
    const wrong = catalogue
      .filter(({ schoolName, prompt }) => !categoryReview(schoolName, prompt.externalRef))
      .filter(({ prompt }) => classifyUnreviewedPrompt(`${prompt.title} ${prompt.promptText}`).primarySlug === "personal-statement");
    expect(wrong).toEqual([]);
  });

  it("has no row pointing at a prompt that no longer exists", () => {
    const live = new Set(catalogue.map(({ schoolName, prompt }) => `${schoolName}|${prompt.externalRef}`));
    const stale = CATEGORY_REVIEW.filter(([school, ref]) => !live.has(`${school}|${ref}`))
      .map(([school, ref]) => `${school} / ${ref}`);
    expect(stale).toEqual([]);
  });

  it("has exactly one row per prompt", () => {
    const keys = CATEGORY_REVIEW.map(([school, ref]) => `${school}|${ref}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toHaveLength(525);
  });

  it("uses only declared primaries, functions, and secondaries", () => {
    const primaries = new Set<string>(REVIEW_PRIMARY_SLUGS);
    const functions = new Set<string>(PROMPT_FUNCTIONS);
    const families = new Set<string>(REVIEW_FAMILY_SECONDARIES);
    const tags = new Set<string>(REVIEW_TAG_SECONDARIES);

    for (const [school, ref, primary, secFamilies, secTags, fn] of CATEGORY_REVIEW) {
      const where = `${school} / ${ref}`;
      expect(primaries.has(primary), `${where} primary ${primary}`).toBe(true);
      expect(functions.has(fn), `${where} function ${fn}`).toBe(true);
      for (const slug of secFamilies) expect(families.has(slug), `${where} secondary family ${slug}`).toBe(true);
      for (const tag of secTags) expect(tags.has(tag), `${where} secondary tag ${tag}`).toBe(true);
    }
  });

  it("never repeats the primary as one of its own secondaries", () => {
    const offenders = CATEGORY_REVIEW
      .filter(([, , primary, secFamilies]) => secFamilies.includes(primary))
      .map(([school, ref]) => `${school} / ${ref}`);
    expect(offenders).toEqual([]);
  });

  it("reserves Personal Statement for genuinely open-topic prompts", () => {
    // Not a style preference: a catch-all Personal Statement is what made any
    // two of 106 prompts read as a 60-point match. If this count grows, the
    // reuse scoring in matching.ts degrades with it.
    //
    // Twelve of 553, and every one is literally an open box - "share more about
    // yourself that is not captured elsewhere", "anything missing", "an essay on
    // any topic of your choice", UChicago's choose-your-own-adventure. Those are
    // the category's definition rather than an erosion of it: a prompt that
    // names a subject, however broad, belongs to the category of that subject.
    const personalStatements = CATEGORY_REVIEW.filter(([, , primary]) => primary === "personal-statement");
    expect(personalStatements).toHaveLength(12);
  });

  it("records the distribution the scoring weights were chosen against", () => {
    // The distribution after the full classification pass. Two numbers carry
    // the argument for that pass:
    //
    // `other` is 109 of 525 (20.8%), against an effective 232 (42%) when 303
    // prompts were falling through to the keyword classifier. `other` earns the
    // neutral rung on the category ladder rather than a match, so every prompt
    // parked there is one that cannot surface a reuse opportunity on category
    // evidence - which made it the largest single cause of missed reuse.
    //
    // `community` is 33, against 7. Seven community prompts in a corpus of
    // American supplemental essays was never a description of the corpus; it
    // was prompts about service and civic engagement being filed `other`.
    //
    // `other` fell again, 136 to 109, when the 28 supporting-material
    // requirements left the essay corpus. They had been parked there for want
    // of anywhere better, which was the clue that they were not essays.
    const counts = new Map<string, number>();
    for (const [, , primary] of CATEGORY_REVIEW) counts.set(primary, (counts.get(primary) ?? 0) + 1);
    expect(Object.fromEntries([...counts].sort())).toEqual({
      "activities-impact": 42,
      "challenge-growth": 31,
      "community": 33,
      "diversity": 50,
      "other": 109,
      "personal-statement": 12,
      "reading-list": 2,
      "roommate": 2,
      "shorts": 38,
      "why-major": 144,
      "why-us": 62,
    });
  });
});
