import { describe, expect, it } from "vitest";

import { ADAPTATION_LABELS, type MatchInput, SCORING, adaptationEffort, scoreMatch } from "./matching";

/**
 * Unit tests for the two-factor content-fit score and its three ceilings.
 *
 * The design is docs/reuse-scoring.md; the measurements behind every constant
 * are docs/evaluation/scoring-sweep.md. What this file pins is the arithmetic
 * and the invariants - that a perfect score is exactly 100, that nothing is ever
 * subtracted, and that word count and school specificity cannot touch the score.
 * Whether the advice is *useful* is the regression set's job
 * (src/lib/reuse-cases.test.ts), and neither replaces reading real output.
 */

/** A pair with everything neutral or in range, so one factor can be varied. */
const base: MatchInput = {
  essayWordCount: 300,
  essayPrimaryFamilySlug: "community",
  essaySecondaryFamilySlugs: [],
  essayTags: [],
  essaySchoolSpecificPhrases: [],
  essayFunction: "reflect",
  promptSchoolName: "Duke University",
  promptPrimaryFamilySlug: "community",
  promptSecondaryFamilySlugs: [],
  promptTags: [],
  promptFunction: "reflect",
  promptMinWordCount: null,
  promptMaxWordCount: 300,
  semanticZScore: 0,
};

/** The z-score that earns exactly `points` of the semantic weight. */
const zFor = (points: number, weight = SCORING.WEIGHTS.semantic) => (points * 3) / weight - 1;

describe("content-fit score", () => {
  it("sums to exactly 100 on a perfect pair, and never above it", () => {
    // Load-bearing. Every band threshold is defined on a 0-100 range, so a
    // maximum anywhere else silently reshifts all three of them.
    const perfect = scoreMatch({ ...base, semanticZScore: 9 });
    expect(perfect.score).toBe(100);
    expect(perfect.factors).toEqual({ category: 35, semantic: 45, function: 20 });
    expect(SCORING.WEIGHTS.category + SCORING.WEIGHTS.semantic + SCORING.WEIGHTS.function).toBe(100);
  });

  it("has one weight vector, so `Other` cannot be penalised twice", () => {
    // The superseded design switched to a reduced vector capped at 85 whenever
    // either side was `Other`, which charged such a pair twice: no category
    // points *and* a lower ceiling. There is now no second vector at all.
    const other = scoreMatch({
      ...base,
      essayPrimaryFamilySlug: "other",
      promptPrimaryFamilySlug: "other",
      essayTags: ["service", "contribution"],
      promptTags: ["service", "contribution"],
      semanticZScore: 9,
    });
    expect(other.score).toBe(Math.round(35 * 0.5 + 45 + 20));
  });
});

describe("the category ladder", () => {
  const rung = (input: Partial<MatchInput>) =>
    scoreMatch({ ...base, ...input, semanticZScore: null }).factors.category;
  const full = SCORING.WEIGHTS.category;

  it("pays a shared primary the most", () => {
    expect(rung({})).toBe(full);
  });

  it("pays a primary that is the other side's stated theme nearly as much", () => {
    // The rung the redesign turns on. An essay whose whole subject is one of the
    // prompt's sub-themes is strongly relevant, and the superseded formula paid
    // it 7 points against 25 for a shared primary - which is what kept
    // Princeton's service prompt out of reach of the activity essays that
    // answer it.
    expect(rung({
      essayPrimaryFamilySlug: "activities-impact",
      promptPrimaryFamilySlug: "community",
      promptSecondaryFamilySlugs: ["activities-impact"],
    })).toBeCloseTo(full * 0.85);
    // Symmetric: it reads either direction.
    expect(rung({
      essayPrimaryFamilySlug: "community",
      essaySecondaryFamilySlugs: ["activities-impact"],
      promptPrimaryFamilySlug: "activities-impact",
    })).toBeCloseTo(full * 0.85);
  });

  it("pays several shared themes more than one", () => {
    const two = rung({
      essayPrimaryFamilySlug: "community", promptPrimaryFamilySlug: "why-major",
      essaySecondaryFamilySlugs: ["diversity", "challenge-growth"],
      promptSecondaryFamilySlugs: ["diversity", "challenge-growth"],
    });
    const one = rung({
      essayPrimaryFamilySlug: "community", promptPrimaryFamilySlug: "why-major",
      essaySecondaryFamilySlugs: ["diversity"],
      promptSecondaryFamilySlugs: ["diversity"],
    });
    expect(two).toBeGreaterThan(one);
    expect(one).toBeCloseTo(full * 0.65);
  });

  it("pays shared tags less than a shared category, and caps them", () => {
    const tags = (n: number) => rung({
      essayPrimaryFamilySlug: "community", promptPrimaryFamilySlug: "why-major",
      essayTags: ["service", "contribution", "leadership", "creativity"].slice(0, n),
      promptTags: ["service", "contribution", "leadership", "creativity"].slice(0, n),
    });
    expect(tags(1)).toBeCloseTo(full * 0.4);
    expect(tags(2)).toBeCloseTo(full * 0.5);
    expect(tags(4)).toBeCloseTo(full * 0.6);
    expect(tags(4)).toBeLessThan(rung({
      essayPrimaryFamilySlug: "community", promptPrimaryFamilySlug: "why-major",
      essaySecondaryFamilySlugs: ["diversity"], promptSecondaryFamilySlugs: ["diversity"],
    }));
  });

  it("gives no overlap a floor rather than a zero", () => {
    // A weak signal, not an assertion of incompatibility. Six of 35 cannot
    // carry a pair anywhere on its own.
    expect(rung({ essayPrimaryFamilySlug: "community", promptPrimaryFamilySlug: "why-major" }))
      .toBeCloseTo(full * 0.15);
  });

  it("scores a missing category neutral, and `Other` as a finding", () => {
    // The distinction the plan asked for and the one that matters most in
    // aggregate. Nobody recording a category is the absence of a signal; a
    // reviewer recording `Other` is the presence of one - they read the prompt
    // and found no category fits. Treating them alike handed a free half-weight
    // to 42% of all pairs.
    const missing = rung({ essayPrimaryFamilySlug: null });
    expect(missing).toBeCloseTo(full * 0.5);

    const other = rung({ essayPrimaryFamilySlug: "other" });
    expect(other).toBeCloseTo(full * 0.15);
    expect(other).toBeLessThan(missing);
  });

  it("does not treat two Why Us prompts as sharing anything", () => {
    // Institutional fit essays share a form and not a word of substance, and
    // Why Us is the one thing a student must not recycle. Before this rule Why
    // Us was involved in 27.8% of every top-band pair in the catalogue.
    expect(rung({ essayPrimaryFamilySlug: "why-us", promptPrimaryFamilySlug: "why-us" }))
      .toBeCloseTo(full * 0.15);
    // A genuinely shared category still pays, for contrast.
    expect(rung({ essayPrimaryFamilySlug: "why-major", promptPrimaryFamilySlug: "why-major" })).toBe(full);
  });
});

describe("the semantic factor", () => {
  it("scores neutral when no provider is configured", () => {
    // Not zero: with no embeddings every pair would read as "nothing you have
    // written fits". This is the shipped path for a workspace whose prompts
    // have no committed vectors.
    expect(scoreMatch({ ...base, semanticZScore: null }).factors.semantic).toBe(SCORING.WEIGHTS.semantic / 2);
    expect(scoreMatch({ ...base, semanticZScore: undefined }).factors.semantic).toBe(SCORING.WEIGHTS.semantic / 2);
  });

  it("saturates at z=2 and floors at z=-1", () => {
    expect(scoreMatch({ ...base, semanticZScore: 2 }).factors.semantic).toBe(SCORING.WEIGHTS.semantic);
    expect(scoreMatch({ ...base, semanticZScore: 9 }).factors.semantic).toBe(SCORING.WEIGHTS.semantic);
    expect(scoreMatch({ ...base, semanticZScore: -1 }).factors.semantic).toBe(0);
    expect(scoreMatch({ ...base, semanticZScore: -3 }).factors.semantic).toBe(0);
  });

  it("cannot reach the reuse floor on its own", () => {
    // The concrete argument against letting similarity dominate. An essay about
    // rebuilding a free library ranks "list five books" second of ten prompts
    // because it is full of the word *books*; saturated similarity plus the
    // category floor must not add up to a recommendation.
    const unrelated = scoreMatch({
      ...base,
      essayPrimaryFamilySlug: "community",
      promptPrimaryFamilySlug: "why-major",
      essayFunction: "reflect",
      promptFunction: "connect-to-school",
      semanticZScore: 9,
    });
    expect(unrelated.factors.semantic).toBe(SCORING.WEIGHTS.semantic);
    expect(unrelated.score).toBeLessThan(60);
  });
});

describe("the function factor", () => {
  const fn = (essayFunction: MatchInput["essayFunction"], promptFunction: MatchInput["promptFunction"]) =>
    scoreMatch({ ...base, essayFunction, promptFunction }).factors.function;

  it("pays an exact match in full", () => {
    expect(fn("reflect", "reflect")).toBe(SCORING.WEIGHTS.function);
  });

  it("charges only a little for a difference inside a group", () => {
    // The defect this redesign fixes. `describe` against `reflect` used to earn
    // zero of 15 for a difference the grouping itself calls "a step, not a
    // rewrite", and that cost three of the twelve activity-family pairs a band.
    expect(fn("describe", "reflect")).toBeCloseTo(SCORING.WEIGHTS.function * SCORING.SAME_GROUP_FRACTION);
    expect(fn("describe", "reflect")).toBeGreaterThan(0);
    expect(fn("describe", "reflect")).toBeLessThan(fn("reflect", "reflect"));
  });

  it("pays nothing across groups, and caps the band", () => {
    const crossed = scoreMatch({ ...base, essayFunction: "reflect", promptFunction: "discuss-future-contribution", semanticZScore: 9 });
    expect(crossed.factors.function).toBe(0);
    // Asserted independently of the score: the owner's specification is that a
    // reflective Community essay is never "slight edits" for a Community prompt
    // asking what the student will contribute, however well the topic matches.
    expect(crossed.recommendedAction).not.toBe("reusable-slight-edits");
    expect(crossed.ceilings).toContain("the prompt asks for something this essay does not do");
  });

  it("scores an unknown function neutral and caps nothing", () => {
    // An essay predating onboarding has no recorded function. Neutral, never
    // mismatched, or every such essay would be locked out of the top band.
    const unknown = scoreMatch({ ...base, essayFunction: null, semanticZScore: 9 });
    expect(unknown.factors.function).toBe(SCORING.WEIGHTS.function / 2);
    expect(unknown.ceilings).toEqual([]);
  });

  it("groups every function", () => {
    for (const name of SCORING.PROMPT_FUNCTIONS) expect(SCORING.FUNCTION_GROUPS[name]).toBeTruthy();
  });
});

describe("format incompatibility", () => {
  it("caps a list against an essay below the reuse floor", () => {
    // No signal in the formula is evidence here: not the vocabulary the
    // embeddings see, and not the fact that both prompts say "describe". Zeroing
    // only the category factor left this pair at 50.
    const listed = scoreMatch({
      ...base,
      essayPrimaryFamilySlug: "reading-list",
      promptPrimaryFamilySlug: "why-major",
      essayFunction: "describe",
      promptFunction: "describe",
      semanticZScore: 9,
    });
    expect(listed.score).toBeLessThanOrEqual(SCORING.FORMAT_MISMATCH_CAP);
    expect(listed.recommendedAction).toBe("new-response");
  });

  it("treats two different formats as incompatible too", () => {
    // A roommate note is not a list of five favourite things. Lumping the three
    // format categories into one bucket left this pair scoring 70.
    const crossFormat = scoreMatch({
      ...base,
      essayPrimaryFamilySlug: "roommate",
      promptPrimaryFamilySlug: "shorts",
      essayFunction: "describe",
      promptFunction: "describe",
      semanticZScore: 9,
    });
    expect(crossFormat.score).toBeLessThanOrEqual(SCORING.FORMAT_MISMATCH_CAP);
  });

  it("leaves two prompts of the same format alone", () => {
    // A roommate note is a perfectly good start on another roommate note.
    const sameFormat = scoreMatch({
      ...base,
      essayPrimaryFamilySlug: "roommate",
      promptPrimaryFamilySlug: "roommate",
      semanticZScore: 9,
    });
    expect(sameFormat.score).toBe(100);
  });
});

describe("word count is editing cost, never content mismatch", () => {
  it("scores identically however far the lengths differ", () => {
    // The acceptance criterion in docs/reuse-scoring.md: contentFitScore is
    // identical for a 500-word essay against a 300-word and a 500-word prompt
    // of the same content. Only the ceiling and the adaptation label differ.
    const long = scoreMatch({ ...base, essayWordCount: 500, promptMaxWordCount: 500 });
    const squeezed = scoreMatch({ ...base, essayWordCount: 500, promptMaxWordCount: 300 });
    const crushed = scoreMatch({ ...base, essayWordCount: 500, promptMaxWordCount: 50 });
    expect(squeezed.score).toBe(long.score);
    expect(crushed.score).toBe(long.score);
    expect(crushed.recommendedAction).not.toBe(long.recommendedAction);
  });

  it("reports adaptation effort as its own axis", () => {
    expect(adaptationEffort(300, null, 300)).toBe("minimal");
    expect(adaptationEffort(500, null, 300)).toBe("some");
    expect(adaptationEffort(500, null, 150)).toBe("significant-shortening");
    expect(adaptationEffort(60, null, 650)).toBe("expansion");
    expect(adaptationEffort(400, 600, 900)).toBe("expansion");
    expect(ADAPTATION_LABELS["significant-shortening"]).toBe("Significant shortening required");
  });

  it("calls a prompt with no numeric limit minimal rather than inventing one", () => {
    // 41 catalogue prompts state their limit in pages, paragraphs or sentences
    // and carry it in the prompt's note, leaving both numeric columns null.
    // Reading a null maximum as zero words would label every one of them as
    // needing shortening.
    expect(adaptationEffort(600, null, null)).toBe("minimal");
    expect(scoreMatch({ ...base, essayWordCount: 600, promptMaxWordCount: null }).ceilings).toEqual([]);
  });

  it("still refuses to call a 15-word note reusable", () => {
    // A defect this repo fixed once: a 15-word note scored 80 against a
    // 650-word prompt and was recommended as ready to reuse. It is not
    // shortened, it is not written.
    const note = scoreMatch({ ...base, essayWordCount: 15, promptMaxWordCount: 650, semanticZScore: 9 });
    expect(note.score).toBeGreaterThan(70);
    expect(note.recommendedAction).toBe("new-response");
  });
});

describe("school specificity is editing cost, never content mismatch", () => {
  it("leaves the score alone and caps the band", () => {
    const clean = scoreMatch({ ...base, semanticZScore: 9 });
    const named = scoreMatch({ ...base, semanticZScore: 9, essaySchoolSpecificPhrases: ["Stanford University"] });
    expect(named.score).toBe(clean.score);
    expect(named.adaptationRequired).toBe(true);
    expect(named.recommendedAction).not.toBe("reusable-slight-edits");
  });

  it("does not flag an essay that names this very school", () => {
    const own = scoreMatch({ ...base, essaySchoolSpecificPhrases: ["Duke University is where"] });
    expect(own.schoolSpecificityRisk).toBe("low");
  });
});

describe("bands", () => {
  it("splits at exactly 70, 60 and 50", () => {
    // A shared primary (35) plus an unrecorded function (neutral 10) is 45, so
    // the semantic factor supplies whole points and each boundary is hit
    // exactly rather than approached through rounding.
    const at = (semanticPoints: number) => {
      const result = scoreMatch({ ...base, essayFunction: null, promptFunction: null, semanticZScore: zFor(semanticPoints) });
      expect(result.score, `semantic ${semanticPoints}`).toBe(45 + semanticPoints);
      return result.recommendedAction;
    };
    expect(at(25)).toBe("reusable-slight-edits");
    expect(at(24)).toBe("reusable-edits");
    expect(at(15)).toBe("reusable-edits");
    expect(at(14)).toBe("reusable-significant-edits");
    expect(at(5)).toBe("reusable-significant-edits");
    expect(at(4)).toBe("new-response");
  });

  it("is unchanged by the redesign", () => {
    // Recall was bought by fixing the factors and the classification, never by
    // lowering a threshold - which is what makes the before-and-after numbers
    // comparable at all.
    expect(SCORING.BAND_ORDER).toEqual(["new-response", "reusable-significant-edits", "reusable-edits", "reusable-slight-edits"]);
  });
});

describe("explainability", () => {
  it("never subtracts, so the factors always reconstruct the score", () => {
    const cases: MatchInput[] = [
      base,
      { ...base, semanticZScore: 9, essaySchoolSpecificPhrases: ["Yale"] },
      { ...base, essayPrimaryFamilySlug: "other", promptTags: ["service"], essayTags: ["service"] },
      { ...base, essayWordCount: 900, promptMaxWordCount: 100 },
      { ...base, essayFunction: "describe", promptFunction: "state-a-future-goal" },
    ];
    for (const input of cases) {
      const result = scoreMatch(input);
      const total = result.factors.category + result.factors.semantic + result.factors.function;
      // Equal unless a cap applied, and never greater.
      expect(result.score).toBeLessThanOrEqual(Math.round(total));
    }
  });

  it("never reports a missing theme for a category that names no theme", () => {
    // "May not address Other themes" is meaningless - `Other` means no category
    // fits this prompt - and "may not address Short Answer themes" is worse,
    // because Short Answer is a length. Both were reaching the student.
    const other = scoreMatch({
      ...base,
      essayPrimaryFamilySlug: "community",
      promptPrimaryFamilySlug: "other",
      promptSecondaryFamilySlugs: [],
    });
    expect(other.missingRequirements).toEqual([]);

    const shortAnswer = scoreMatch({
      ...base,
      essayPrimaryFamilySlug: "community",
      promptPrimaryFamilySlug: "shorts",
      promptSecondaryFamilySlugs: [],
    });
    expect(shortAnswer.missingRequirements).toEqual([]);

    // A real category the essay does not carry is still reported.
    const real = scoreMatch({
      ...base,
      essayPrimaryFamilySlug: "community",
      promptPrimaryFamilySlug: "why-major",
      promptSecondaryFamilySlugs: [],
    });
    expect(real.missingRequirements).toEqual(["may not address Why Major themes"]);
  });

  it("names the shared themes and every binding ceiling", () => {
    const result = scoreMatch({
      ...base,
      essayWordCount: 900,
      promptMaxWordCount: 100,
      essaySchoolSpecificPhrases: ["Princeton University"],
    });
    expect(result.explanation).toContain("Community");
    expect(result.ceilings.length).toBeGreaterThan(0);
    expect(result.explanation).toContain("Limited by");
  });
});
