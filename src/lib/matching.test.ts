import { describe, expect, it } from "vitest";

import { scoreMatch } from "./matching";

const base = {
  essayWordCount: 300,
  essayPrimaryFamilySlug: "community",
  essaySecondaryFamilySlugs: ["diversity"],
  essaySchoolSpecificPhrases: [] as string[],
  promptSchoolName: "Lakeview University",
  promptPrimaryFamilySlug: "community",
  promptSecondaryFamilySlugs: [] as string[],
  promptMinWordCount: 200,
  promptMaxWordCount: 350,
};

describe("deterministic essay-prompt match scoring", () => {
  it("scores a same-primary-family, in-range essay as ready to reuse", () => {
    const result = scoreMatch(base);
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.recommendedAction).toBe("ready-to-reuse");
    expect(result.matchedThemes).toContain("Community");
    expect(result.schoolSpecificityRisk).toBe("low");
  });

  it("never uses category equality alone: word-count mismatch reduces the score", () => {
    const inRange = scoreMatch(base);
    const tooLong = scoreMatch({ ...base, essayWordCount: 900 });
    expect(tooLong.score).toBeLessThan(inRange.score);
    expect(tooLong.wordCountDifference).toBe(900 - base.promptMaxWordCount);
  });

  it("caps the recommendation at major-adaptation for a why-us prompt when the essay targets a different school", () => {
    const result = scoreMatch({
      ...base,
      promptPrimaryFamilySlug: "why-us",
      essaySchoolSpecificPhrases: ["Stanford", "the Farm"],
    });
    expect(result.schoolSpecificityRisk).toBe("high");
    expect(result.recommendedAction).not.toBe("ready-to-reuse");
    expect(result.recommendedAction).not.toBe("minor-adaptation");
  });

  it("does not penalize an essay already tailored to the same school as the why-us prompt", () => {
    const result = scoreMatch({
      ...base,
      promptPrimaryFamilySlug: "why-us",
      essaySchoolSpecificPhrases: ["Lakeview University", "Lakeview's Civic Lab"],
    });
    expect(result.schoolSpecificityRisk).toBe("low");
  });

  it("flags missing requirements for families the essay never touches", () => {
    const result = scoreMatch({
      ...base,
      promptPrimaryFamilySlug: "why-major",
      promptSecondaryFamilySlugs: ["personal-statement"],
    });
    expect(result.missingRequirements.length).toBeGreaterThan(0);
  });

  it("is deterministic: identical input always produces an identical score", () => {
    expect(scoreMatch(base)).toEqual(scoreMatch(base));
  });
  // A prompt with no stated minimum used to make any essay under the maximum a
  // perfect fit, so a 15-word note scored 80 against a 650-word prompt and was
  // recommended as ready to reuse. That is the single most misleading output
  // the matcher could produce: it tells a student a stub is finished work.
  describe("short essays against a prompt with no stated minimum", () => {
    const longPrompt = { ...base, promptMinWordCount: null, promptMaxWordCount: 650 };

    it("does not call a 15-word stub ready to reuse for a 650-word prompt", () => {
      const result = scoreMatch({ ...longPrompt, essayWordCount: 15 });
      expect(result.recommendedAction).not.toBe("ready-to-reuse");
      expect(result.score).toBeLessThan(80);
    });

    it("penalises proportionally rather than all-or-nothing", () => {
      const stub = scoreMatch({ ...longPrompt, essayWordCount: 15 });
      const halfLength = scoreMatch({ ...longPrompt, essayWordCount: 350 });
      const full = scoreMatch({ ...longPrompt, essayWordCount: 600 });
      expect(stub.score).toBeLessThan(halfLength.score);
      expect(halfLength.score).toBeLessThan(full.score);
      expect(full.recommendedAction).toBe("ready-to-reuse");
    });

    it("leaves a character-limited prompt alone (no word maximum to measure against)", () => {
      const charLimited = scoreMatch({ ...base, essayWordCount: 15, promptMinWordCount: null, promptMaxWordCount: null });
      expect(charLimited.score).toBe(scoreMatch({ ...base, essayWordCount: 300, promptMinWordCount: null, promptMaxWordCount: null }).score);
    });

    // When the school states a minimum and the essay clears it, the school has
    // already said the length is acceptable - so this path must not fire.
    it("does not second-guess a prompt that states its own minimum", () => {
      const stated = scoreMatch({ ...base, essayWordCount: 180, promptMinWordCount: 100, promptMaxWordCount: 300 });
      expect(stated.score).toBeGreaterThanOrEqual(80);
      expect(stated.recommendedAction).toBe("ready-to-reuse");
    });

    it("still penalises an essay that misses a stated minimum", () => {
      const short = scoreMatch({ ...base, essayWordCount: 15, promptMinWordCount: 600, promptMaxWordCount: 650 });
      expect(short.score).toBeLessThan(80);
    });
  });

  // The maximum reachable score is exactly 80, which is also the
  // ready-to-reuse cutoff, so any ungated penalty makes that action
  // unreachable. Both fixtures the suite locks have to keep scoring 80.
  it("keeps a well-fitting essay at the top of the scale", () => {
    expect(scoreMatch(base).score).toBe(80);
    expect(scoreMatch({ ...base, essayWordCount: 180, promptMinWordCount: 100, promptMaxWordCount: 300 }).score).toBe(80);
  });
  // Content fit and adaptation are two independent questions. A school name
  // used to do both jobs at once: it subtracted 40 points from the content
  // score AND capped the action, so a perfect content match scored 40 and was
  // filed under "do not reuse". A strong Stanford "Why Us" essay is a genuinely
  // useful starting point for Duke - it just cannot be submitted unchanged.
  describe("content fit is independent of adaptation required", () => {
    const strongFitOtherSchool = {
      ...base,
      promptPrimaryFamilySlug: "why-us",
      essayPrimaryFamilySlug: "why-us",
      essaySchoolSpecificPhrases: ["Stanford University"],
      promptSchoolName: "Duke University",
    };

    it("does not let a school reference reduce the content-fit score", () => {
      const clean = scoreMatch({ ...strongFitOtherSchool, essaySchoolSpecificPhrases: [] });
      const named = scoreMatch(strongFitOtherSchool);
      expect(named.contentFitScore).toBe(clean.contentFitScore);
      expect(named.score).toBe(clean.score);
    });

    it("keeps a strong content match reusable with edits rather than a new response", () => {
      const r = scoreMatch(strongFitOtherSchool);
      expect(r.recommendedAction).not.toBe("new-response");
      expect(r.adaptationRequired).toBe(true);
      expect(r.schoolSpecificityRisk).toBe("high");
    });

    it("flags the adaptation explicitly instead of hiding it in the score", () => {
      const r = scoreMatch(strongFitOtherSchool);
      expect(r.explanation.toLowerCase()).toContain("adapt");
    });

    it("marks an essay needing no school edits as ready to reuse", () => {
      const r = scoreMatch({ ...strongFitOtherSchool, essaySchoolSpecificPhrases: [] });
      expect(r.recommendedAction).toBe("ready-to-reuse");
      expect(r.adaptationRequired).toBe(false);
    });

    it("keeps an essay already tailored to this school ready to reuse", () => {
      const r = scoreMatch({ ...strongFitOtherSchool, essaySchoolSpecificPhrases: ["Duke University"] });
      expect(r.schoolSpecificityRisk).toBe("low");
      expect(r.recommendedAction).toBe("ready-to-reuse");
    });

    // The other half of the requirement: school detection must not rescue an
    // essay whose substance does not answer the prompt.
    it("still recommends a new response when the content does not fit, school name or not", () => {
      const weak = {
        ...base,
        essayPrimaryFamilySlug: "shorts",
        essaySecondaryFamilySlugs: [] as string[],
        promptPrimaryFamilySlug: "why-major",
        promptSecondaryFamilySlugs: [] as string[],
        essayWordCount: 12,
        promptMinWordCount: null,
        promptMaxWordCount: 650,
      };
      expect(scoreMatch(weak).recommendedAction).toBe("new-response");
      expect(scoreMatch({ ...weak, essaySchoolSpecificPhrases: ["Stanford University"] }).recommendedAction).toBe("new-response");
    });
  });
});
