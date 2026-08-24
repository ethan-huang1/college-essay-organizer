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
});
