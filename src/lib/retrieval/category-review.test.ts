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
  const catalogue = listCoveredSchoolNames().flatMap((schoolName) => {
    const record = lookupSchoolSource(schoolName);
    return (record?.prompts ?? []).map((prompt) => ({ schoolName, prompt }));
  });

  it("covers the reviewed part of the catalogue, and says how much is left", () => {
    const unreviewed = catalogue.filter(({ schoolName, prompt }) => !categoryReview(schoolName, prompt.externalRef));
    expect(catalogue).toHaveLength(553);
    expect(catalogue.length - unreviewed.length).toBe(250);
    // Pinned, not open-ended: a rebuild that adds prompts must move this number
    // deliberately, and reviewing the worksheet must bring it down.
    expect(unreviewed).toHaveLength(303);
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
    expect(keys).toHaveLength(250);
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
    const personalStatements = CATEGORY_REVIEW.filter(([, , primary]) => primary === "personal-statement");
    expect(personalStatements).toHaveLength(2);
  });

  it("records the distribution the scoring weights were chosen against", () => {
    // Five rows retired with the 2026-27 rebuild (two Oberlin BA+BFA prompts,
    // two UT Austin ones, one Yale) because their prompts no longer exist -
    // hence 250 rather than 255, with why-major and other down by the same.
    const counts = new Map<string, number>();
    for (const [, , primary] of CATEGORY_REVIEW) counts.set(primary, (counts.get(primary) ?? 0) + 1);
    expect(Object.fromEntries([...counts].sort())).toEqual({
      "activities-impact": 14,
      "challenge-growth": 23,
      community: 7,
      diversity: 30,
      other: 79,
      "personal-statement": 2,
      "reading-list": 1,
      roommate: 2,
      shorts: 13,
      "why-major": 57,
      "why-us": 22,
    });
  });
});
