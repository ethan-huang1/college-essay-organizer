import { describe, expect, it } from "vitest";

import { type MatchInput, SCORING, scoreMatch } from "./matching";

// A same-category pair, in range, with no school-specific material. Semantic
// similarity and both functions are left unset, which is the shipped state: no
// embedding provider is configured and an unassigned essay has no known
// function. Both then score their neutral value - see `neutral` in matching.ts.
const base: MatchInput = {
  essayWordCount: 300,
  essayPrimaryFamilySlug: "community",
  essaySecondaryFamilySlugs: ["diversity"],
  essaySchoolSpecificPhrases: [],
  promptSchoolName: "Lakeview University",
  promptPrimaryFamilySlug: "community",
  promptSecondaryFamilySlugs: [],
  promptMinWordCount: 200,
  promptMaxWordCount: 350,
};

/** The z-score that yields exactly `points` from the semantic factor. */
const zFor = (points: number, weight = SCORING.WEIGHTS.normal.semantic) => (points * 3) / weight - 1;

describe("deterministic essay-prompt match scoring", () => {
  it("is deterministic: identical input always produces an identical score", () => {
    expect(scoreMatch(base)).toEqual(scoreMatch(base));
  });

  // The whole point of the redesign. The previous formula gave a shared primary
  // 60 points on top of a 20 baseline, landing exactly on the 80-point "ready
  // to reuse" threshold - so two prompts sharing a broad category were called
  // ready to submit unchanged, with 106 of 255 prompts in one category.
  describe("a shared category is the weakest of the four signals", () => {
    it("scores a shared primary category at 25 and nothing more", () => {
      expect(scoreMatch(base).factors.primary).toBe(25);
      expect(scoreMatch({ ...base, promptPrimaryFamilySlug: "why-major" }).factors.primary).toBe(0);
    });

    it("cannot reach the top band on category and perfect semantic fit alone", () => {
      // 25 + 35 + 0 shared themes + 0 (functions differ across groups) = 60.
      const result = scoreMatch({
        ...base,
        essaySecondaryFamilySlugs: [],
        semanticZScore: 3,
        essayFunction: "reflect",
        promptFunction: "discuss-future-contribution",
      });
      expect(result.factors.semantic).toBe(35);
      expect(result.contentFitScore).toBe(60);
      expect(result.recommendedAction).toBe("reusable-edits");
    });
  });

  // The specification for factor 4, from the product owner: a reflective
  // Community essay must not be labelled "reusable with slight edits" for a
  // Community prompt asking what the student will contribute in future, however
  // strongly topic and themes overlap.
  describe("prompt function", () => {
    const duke: MatchInput = {
      ...base,
      essaySecondaryFamilySlugs: ["diversity"],
      essayTags: ["contribution"],
      promptSecondaryFamilySlugs: ["diversity"],
      promptTags: ["contribution"],
      semanticZScore: zFor(25),
      essayFunction: "reflect",
    };

    it("keeps a reflective essay out of the top band for a future-contribution prompt", () => {
      const result = scoreMatch({ ...duke, promptFunction: "discuss-future-contribution" });
      // 25 primary + 25 semantic + 14 (two shared themes) + 0 function = 64.
      expect(result.contentFitScore).toBe(64);
      expect(result.recommendedAction).toBe("reusable-edits");
      expect(result.ceilings).toContain("the prompt asks for something this essay does not do");
    });

    it("caps the band even when the score alone would clear 70", () => {
      // Same pair with three shared themes: 25 + 25 + 20 + 0 = 70, which would
      // otherwise be the top band. The ceiling is what stops it, so this is
      // asserted independently of the score.
      const result = scoreMatch({
        ...duke,
        essayTags: ["contribution", "service", "leadership"],
        promptTags: ["contribution", "service", "leadership"],
        promptFunction: "discuss-future-contribution",
      });
      expect(result.contentFitScore).toBeGreaterThanOrEqual(70);
      expect(result.recommendedAction).toBe("reusable-edits");
    });

    it("does not cap for a mismatch within the same group", () => {
      // describe -> reflect is a step, not a rewrite.
      const result = scoreMatch({ ...duke, essayFunction: "describe", promptFunction: "reflect" });
      expect(result.factors.function).toBe(0);
      expect(result.ceilings).not.toContain("the prompt asks for something this essay does not do");
    });

    it("treats an unknown function as neutral, never as a mismatch", () => {
      const unknown = scoreMatch({ ...duke, essayFunction: null, promptFunction: "discuss-future-contribution" });
      expect(unknown.factors.function).toBe(10);
      expect(unknown.ceilings).not.toContain("the prompt asks for something this essay does not do");
      // Neutral has to sit strictly between a mismatch and a match, or an essay
      // with no recorded function is either punished or flattered.
      const mismatch = scoreMatch({ ...duke, promptFunction: "discuss-future-contribution" });
      const match = scoreMatch({ ...duke, promptFunction: "reflect" });
      expect(unknown.contentFitScore).toBeGreaterThan(mismatch.contentFitScore);
      expect(unknown.contentFitScore).toBeLessThan(match.contentFitScore);
    });

    it("groups every function, so no pair is unclassifiable", () => {
      for (const fn of SCORING.PROMPT_FUNCTIONS) expect(SCORING.FUNCTION_GROUPS[fn]).toBeTruthy();
    });
  });

  describe("secondary theme overlap", () => {
    it("counts families and tags in one pool, at 7 points each, capped at 20", () => {
      const shared = (n: number) => scoreMatch({
        ...base,
        essaySecondaryFamilySlugs: [],
        essayTags: ["contribution", "service", "leadership", "creativity"].slice(0, n),
        promptTags: ["contribution", "service", "leadership", "creativity"].slice(0, n),
      }).factors.secondary;
      expect(shared(0)).toBe(0);
      expect(shared(1)).toBe(7);
      expect(shared(2)).toBe(14);
      expect(shared(3)).toBe(20);
      expect(shared(4)).toBe(20);
    });

    it("counts a primary that appears in the other side's secondaries", () => {
      // An essay whose main subject is one of the prompt's stated sub-themes is
      // genuinely relevant, even though the primaries differ.
      const result = scoreMatch({
        ...base,
        essayPrimaryFamilySlug: "diversity",
        essaySecondaryFamilySlugs: [],
        promptPrimaryFamilySlug: "community",
        promptSecondaryFamilySlugs: ["diversity"],
      });
      expect(result.factors.primary).toBe(0);
      expect(result.factors.secondary).toBe(7);
    });

    it("never counts Other as a shared theme", () => {
      const result = scoreMatch({
        ...base,
        essayPrimaryFamilySlug: "other",
        essaySecondaryFamilySlugs: ["other"],
        promptPrimaryFamilySlug: "other",
        promptSecondaryFamilySlugs: ["other"],
      });
      expect(result.factors.secondary).toBe(0);
    });
  });

  // Other is 94 of the 255 catalogue prompts. Excluding it from matching - as
  // the previous NOT_A_SHARED_THEME rule did for the primary factor alone -
  // would tell a student that 37% of their prompts match nothing they have ever
  // written. Reweighting is the middle ground: no free points for sharing "no
  // meaningful category", but no prohibition either.
  describe("the Other weight vector", () => {
    const otherPair: MatchInput = { ...base, essayPrimaryFamilySlug: "other", promptPrimaryFamilySlug: "other", essaySecondaryFamilySlugs: [] };

    it("awards no primary points for two prompts that both fit nowhere", () => {
      expect(scoreMatch(otherPair).factors.primary).toBe(0);
    });

    it("reweights onto the signals that carry information, for a ceiling of 85", () => {
      const best = scoreMatch({
        ...otherPair,
        semanticZScore: 5,
        essayTags: ["contribution", "service", "leadership"],
        promptTags: ["contribution", "service", "leadership"],
        essayFunction: "reflect",
        promptFunction: "reflect",
      });
      expect(best.factors).toEqual({ primary: 0, semantic: 40, secondary: 20, function: 25 });
      expect(best.contentFitScore).toBe(85);
      expect(best.recommendedAction).toBe("reusable-slight-edits");
    });

    it("applies when either side is Other, not only both", () => {
      expect(scoreMatch({ ...base, promptPrimaryFamilySlug: "other", semanticZScore: 5 }).factors.semantic).toBe(40);
      expect(scoreMatch({ ...base, essayPrimaryFamilySlug: "other", semanticZScore: 5 }).factors.semantic).toBe(40);
    });

    it("does not reweight a pair whose categories merely differ", () => {
      // "No category exists" and "the categories disagree" are different
      // situations. Reweighting the second would reward genuine mismatch.
      const mismatch = scoreMatch({ ...base, promptPrimaryFamilySlug: "why-major", semanticZScore: 5 });
      expect(mismatch.factors.semantic).toBe(35);
      expect(mismatch.factors.primary).toBe(0);
    });
  });

  describe("semantic similarity", () => {
    it("scores neutral, not zero, when no provider is configured", () => {
      expect(scoreMatch(base).factors.semantic).toBe(18);
      expect(scoreMatch({ ...base, semanticZScore: null }).factors.semantic).toBe(18);
    });

    it("reads a calibrated z-score, saturating at both ends", () => {
      expect(scoreMatch({ ...base, semanticZScore: -3 }).factors.semantic).toBe(0);
      expect(scoreMatch({ ...base, semanticZScore: 0 }).factors.semantic).toBe(12);
      expect(scoreMatch({ ...base, semanticZScore: 2 }).factors.semantic).toBe(35);
      expect(scoreMatch({ ...base, semanticZScore: 9 }).factors.semantic).toBe(35);
    });
  });

  // Word count is editing cost, not content mismatch. The previous curve
  // saturated at -25, so 500 -> 300 and 500 -> 50 were scored identically and
  // it could not tell condensing from rewriting.
  describe("word count never changes the score, only the band", () => {
    // Scores high on the other three factors, so the band observed here is the
    // ceiling's doing and not just a low score. Asserting the band on the plain
    // base fixture would prove nothing: it scores 53, which is already below
    // every ceiling under test.
    const p = (max: number) => ({
      ...base,
      essayWordCount: 500,
      promptMinWordCount: null,
      promptMaxWordCount: max,
      semanticZScore: 5,
      essayFunction: "reflect" as const,
      promptFunction: "reflect" as const,
    });

    it("scores an over-length essay exactly as it scores an in-range one", () => {
      expect(scoreMatch(p(300)).contentFitScore).toBe(scoreMatch(p(500)).contentFitScore);
      expect(scoreMatch(p(50)).contentFitScore).toBe(scoreMatch(p(500)).contentFitScore);
    });

    it("treats ordinary shortening as free and fundamental compression as costly", () => {
      // 500 -> 400, 300 and 250 are ordinary editing: no ceiling, top band.
      for (const max of [400, 300, 250]) {
        expect(scoreMatch(p(max)).ceilings, `${max}w`).toEqual([]);
        expect(scoreMatch(p(max)).recommendedAction, `${max}w`).toBe("reusable-slight-edits");
      }
      expect(scoreMatch(p(150)).recommendedAction).toBe("reusable-edits");
      expect(scoreMatch(p(50)).recommendedAction).toBe("reusable-significant-edits");
    });

    it("reports the difference either way", () => {
      expect(scoreMatch(p(300)).wordCountDifference).toBe(200);

      expect(scoreMatch({ ...base, essayWordCount: 100 }).wordCountDifference).toBe(100 - 350);
    });
  });

  // The single most misleading output the matcher could produce: telling a
  // student a stub is finished work. A 15-word note once scored 80 against a
  // 650-word prompt and was recommended as ready to reuse. Removing the
  // word-count penalty without this ceiling would reintroduce it.
  describe("an essay that is not shortened but unwritten", () => {
    const longPrompt = { ...base, promptMinWordCount: null, promptMaxWordCount: 650 };

    it("calls a 15-word stub a new response for a 650-word prompt", () => {
      expect(scoreMatch({ ...longPrompt, essayWordCount: 15 }).recommendedAction).toBe("new-response");
    });

    it("does not second-guess a prompt that states its own minimum", () => {
      // The school has already said the length is acceptable.
      const stated = scoreMatch({ ...base, essayWordCount: 180, promptMinWordCount: 100, promptMaxWordCount: 300 });
      expect(stated.ceilings).toEqual([]);
    });

    it("still caps an essay that misses a stated minimum", () => {
      const short = scoreMatch({
        ...base,
        essayWordCount: 15,
        promptMinWordCount: 600,
        promptMaxWordCount: 650,
        semanticZScore: 5,
        essayFunction: "reflect",
        promptFunction: "reflect",
      });
      expect(short.ceilings).toContain("length: is under the stated minimum");
      expect(short.recommendedAction).toBe("reusable-edits");
    });

    it("leaves a character-limited prompt alone: no word maximum to measure against", () => {
      const noMax = { ...base, promptMinWordCount: null, promptMaxWordCount: null };
      expect(scoreMatch({ ...noMax, essayWordCount: 15 })).toEqual(scoreMatch({ ...noMax, essayWordCount: 300 }));
    });
  });

  // Content fit and adaptation are independent questions. A school name used to
  // do both jobs: it subtracted 40 points from the content score AND capped the
  // action, so a perfect content match scored 40 and was filed under "do not
  // reuse". A strong Stanford "Why Us" essay is a genuinely useful starting
  // point for Duke - it just cannot be submitted unchanged.
  describe("content fit is independent of adaptation required", () => {
    const strongFitOtherSchool: MatchInput = {
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
    });

    it("keeps a strong content match reusable rather than a new response", () => {
      const result = scoreMatch(strongFitOtherSchool);
      expect(result.recommendedAction).not.toBe("new-response");
      expect(result.adaptationRequired).toBe(true);
      expect(result.schoolSpecificityRisk).toBe("high");
      expect(result.explanation.toLowerCase()).toContain("adapt");
    });

    it("caps a fit prompt naming another school at significant edits", () => {
      const result = scoreMatch({ ...strongFitOtherSchool, semanticZScore: 5, essayFunction: "reflect", promptFunction: "reflect" });
      expect(result.contentFitScore).toBeGreaterThanOrEqual(70);
      expect(result.recommendedAction).toBe("reusable-significant-edits");
    });

    it("caps a non-fit prompt naming another school one band lower only", () => {
      const result = scoreMatch({
        ...strongFitOtherSchool,
        promptPrimaryFamilySlug: "community",
        essayPrimaryFamilySlug: "community",
        semanticZScore: 5,
        essayFunction: "reflect",
        promptFunction: "reflect",
      });
      expect(result.schoolSpecificityRisk).toBe("medium");
      expect(result.recommendedAction).toBe("reusable-edits");
    });

    it("does not penalise an essay already tailored to this school", () => {
      const result = scoreMatch({ ...strongFitOtherSchool, essaySchoolSpecificPhrases: ["Duke University"] });
      expect(result.schoolSpecificityRisk).toBe("low");
      expect(result.ceilings).toEqual([]);
    });

    // The other half of the requirement: school detection must not rescue an
    // essay whose substance does not answer the prompt.
    it("still recommends a new response when the content does not fit, school name or not", () => {
      const weak: MatchInput = {
        ...base,
        essayPrimaryFamilySlug: "shorts",
        essaySecondaryFamilySlugs: [],
        promptPrimaryFamilySlug: "why-major",
        essayWordCount: 12,
        promptMinWordCount: null,
        promptMaxWordCount: 650,
      };
      expect(scoreMatch(weak).recommendedAction).toBe("new-response");
      expect(scoreMatch({ ...weak, essaySchoolSpecificPhrases: ["Stanford University"] }).recommendedAction).toBe("new-response");
    });
  });

  describe("bands and ceilings", () => {
    it("maps scores onto the four bands at 70, 60 and 50", () => {
      const at = (points: number) => scoreMatch({
        ...base,
        essaySecondaryFamilySlugs: [],
        essayFunction: "reflect",
        promptFunction: "reflect",
        semanticZScore: zFor(points - 25 - 20),
      });
      expect(at(70).recommendedAction).toBe("reusable-slight-edits");
      expect(at(69).recommendedAction).toBe("reusable-edits");
      expect(at(60).recommendedAction).toBe("reusable-edits");
      expect(at(59).recommendedAction).toBe("reusable-significant-edits");
      expect(at(50).recommendedAction).toBe("reusable-significant-edits");
      expect(at(49).recommendedAction).toBe("new-response");
    });

    it("takes the lowest band any ceiling allows", () => {
      // A fit prompt naming another school (significant edits) and a function
      // mismatch (edits) together must yield the lower of the two.
      const result = scoreMatch({
        ...base,
        promptPrimaryFamilySlug: "why-us",
        essayPrimaryFamilySlug: "why-us",
        essaySchoolSpecificPhrases: ["Stanford University"],
        promptSchoolName: "Duke University",
        semanticZScore: 5,
        essayFunction: "reflect",
        promptFunction: "connect-to-school",
      });
      expect(result.ceilings.length).toBeGreaterThan(1);
      expect(result.recommendedAction).toBe("reusable-significant-edits");
    });

    it("explains why a band is lower than its score", () => {
      const result = scoreMatch({ ...base, essayWordCount: 5000, promptMinWordCount: null, promptMaxWordCount: 250 });
      expect(result.explanation).toContain("Limited by");
    });
  });
});
