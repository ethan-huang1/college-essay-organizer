import { describe, expect, it } from "vitest";

import { scoreMatch } from "./matching";

const base = {
  essayWordCount: 300,
  essayPrimaryFamilySlug: "activities-impact",
  essaySecondaryFamilySlugs: ["challenge-growth"],
  essaySchoolSpecificPhrases: [] as string[],
  promptSchoolName: "Lakeview University",
  promptPrimaryFamilySlug: "activities-impact",
  promptSecondaryFamilySlugs: [] as string[],
  promptMinWordCount: 200,
  promptMaxWordCount: 350,
};

describe("deterministic essay-prompt match scoring", () => {
  it("scores a same-primary-family, in-range essay as ready to reuse", () => {
    const result = scoreMatch(base);
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.recommendedAction).toBe("ready-to-reuse");
    expect(result.matchedThemes).toContain("Activities, Leadership & Impact");
    expect(result.schoolSpecificityRisk).toBe("low");
  });

  it("never uses category equality alone: word-count mismatch reduces the score", () => {
    const inRange = scoreMatch(base);
    const tooLong = scoreMatch({ ...base, essayWordCount: 900 });
    expect(tooLong.score).toBeLessThan(inRange.score);
    expect(tooLong.wordCountDifference).toBe(900 - base.promptMaxWordCount);
  });

  it("caps the recommendation at major-adaptation for a why-school prompt when the essay targets a different school", () => {
    const result = scoreMatch({
      ...base,
      promptPrimaryFamilySlug: "why-school",
      essaySchoolSpecificPhrases: ["Stanford", "the Farm"],
    });
    expect(result.schoolSpecificityRisk).toBe("high");
    expect(result.recommendedAction).not.toBe("ready-to-reuse");
    expect(result.recommendedAction).not.toBe("minor-adaptation");
  });

  it("does not penalize an essay already tailored to the same school as the why-school prompt", () => {
    const result = scoreMatch({
      ...base,
      promptPrimaryFamilySlug: "why-school",
      essaySchoolSpecificPhrases: ["Lakeview University", "Lakeview's Civic Lab"],
    });
    expect(result.schoolSpecificityRisk).toBe("low");
  });

  it("flags missing requirements for families the essay never touches", () => {
    const result = scoreMatch({
      ...base,
      promptPrimaryFamilySlug: "why-major",
      promptSecondaryFamilySlugs: ["intellectual-curiosity"],
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
});
