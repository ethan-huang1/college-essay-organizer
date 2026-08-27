import { describe, expect, it } from "vitest";

import { reuseCandidate, reuseOpportunities, summarizePrompts, workState, type ProgressPrompt, type ReuseMatch } from "./progress";

function prompt(overrides: Partial<ProgressPrompt> = {}): ProgressPrompt {
  return { status: "not-started", isCurrentCycle: true, assignedEssay: null, suggestedMatches: [], ...overrides };
}

function suggestion(recommendedAction: string, score = 80) {
  return { essayId: "essay-1", essayTitle: "The Metronome", score, recommendedAction };
}

describe("workState", () => {
  it("treats submitted work as complete", () => {
    expect(workState({ status: "submitted" })).toBe("complete");
    expect(workState({ status: "complete" })).toBe("complete");
    expect(workState({ status: "in-progress" })).toBe("in-progress");
    expect(workState({ status: "not-started" })).toBe("not-started");
  });
});

describe("reuseCandidate", () => {
  it("offers the strongest reusable suggestion for an unanswered prompt", () => {
    const candidate = reuseCandidate(prompt({ suggestedMatches: [suggestion("minor-adaptation")] }));
    expect(candidate?.essayTitle).toBe("The Metronome");
  });

  it("ignores suggestions the matcher judged not worth reusing", () => {
    expect(reuseCandidate(prompt({ suggestedMatches: [suggestion("major-adaptation"), suggestion("new-response")] }))).toBeNull();
  });

  it("is not an opportunity once an essay is assigned", () => {
    expect(reuseCandidate(prompt({
      assignedEssay: { id: "essay-1", title: "The Metronome" },
      suggestedMatches: [suggestion("ready-to-reuse")],
    }))).toBeNull();
  });
});

describe("summarizePrompts", () => {
  it("counts completion against current-cycle prompts only", () => {
    const summary = summarizePrompts([
      prompt({ status: "complete" }),
      prompt({ status: "submitted" }),
      prompt({ status: "in-progress" }),
      prompt(),
      prompt({ suggestedMatches: [suggestion("ready-to-reuse")] }),
      prompt({ status: "complete", isCurrentCycle: false }),
    ]);

    expect(summary).toEqual({
      total: 5,
      complete: 2,
      inProgress: 1,
      notStarted: 2,
      assigned: 0,
      reusable: 1,
      remaining: 3,
      previousCycle: 1,
    });
  });
});

describe("reuseOpportunities", () => {
  const essays = [{ id: "essay-1", title: "The Metronome", wordCount: 620, status: "ready" }];

  function match(promptId: string, recommendedAction: string, score = 85, schoolSpecificityRisk = "low"): ReuseMatch {
    return {
      id: `match-${promptId}`,
      essayId: "essay-1",
      promptId,
      score,
      recommendedAction,
      explanation: "Shares Personal Statement / Core Story.",
      promptTitle: `Prompt ${promptId}`,
      schoolName: "Brown University",
      schoolSpecificityRisk,
      missingRequirements: [],
    matchedThemes: ["Community"],
    wordCountDifference: 0,
    promptMaxWordCount: 350,
    essayWordCount: 300,
    };
  }

  it("separates prompts the essay already answers from the ones it still could", () => {
    const groups = reuseOpportunities(
      essays,
      [match("p1", "ready-to-reuse"), match("p2", "minor-adaptation", 60), match("p3", "new-response", 20)],
      [
        { id: "p1", isCurrentCycle: true, assignedEssay: { id: "essay-1" } },
        { id: "p2", isCurrentCycle: true, assignedEssay: null },
        { id: "p3", isCurrentCycle: true, assignedEssay: null },
      ],
    );

    expect(groups).toHaveLength(1);
    expect(groups[0].inUse.map((row) => row.promptId)).toEqual(["p1"]);
    // p2 is a minor-adaptation, which is now a "reusable with edits"
    // recommendation rather than sitting in the ready bucket.
    expect(groups[0].withEdits.map((row) => row.promptId)).toEqual(["p2"]);
    expect(groups[0].open).toEqual([]);
  });

  it("counts a weak-scoring assignment as in use", () => {
    const groups = reuseOpportunities(
      essays,
      [match("p1", "new-response", 20)],
      [{ id: "p1", isCurrentCycle: true, assignedEssay: { id: "essay-1" } }],
    );

    expect(groups[0].inUse.map((row) => row.promptId)).toEqual(["p1"]);
    expect(groups[0].open).toEqual([]);
  });

  // Deliberately inverted from its original form. This used to assert that an
  // institution-specific match was "not reusable"; that was the product defect.
  // It is reusable - with edits - and the two states stay distinct.
  it("keeps an institution-specific match recommended, in the with-edits state", () => {
    const groups = reuseOpportunities(
      essays,
      [match("p1", "major-adaptation", 80, "high"), match("p2", "ready-to-reuse")],
      [{ id: "p1", isCurrentCycle: true, assignedEssay: null }, { id: "p2", isCurrentCycle: true, assignedEssay: null }],
    );

    expect(groups[0].withEdits.map((row) => row.promptId)).toEqual(["p1"]);
    expect(groups[0].open.map((row) => row.promptId)).toEqual(["p2"]);
  });

  it("surfaces an essay whose only match needs school-specific edits", () => {
    const groups = reuseOpportunities(
      essays,
      [match("p1", "major-adaptation", 80, "high")],
      [{ id: "p1", isCurrentCycle: true, assignedEssay: null }],
    );

    expect(groups).toHaveLength(1);
    expect(groups[0].open).toEqual([]);
    expect(groups[0].withEdits).toHaveLength(1);
  });

  it("does not flag a risk on a prompt another essay already answers", () => {
    const groups = reuseOpportunities(
      essays,
      [match("p1", "major-adaptation", 30, "high")],
      [{ id: "p1", isCurrentCycle: true, assignedEssay: { id: "essay-9" } }],
    );

    expect(groups).toEqual([]);
  });

  it("leaves out prompts another essay already answers", () => {
    const groups = reuseOpportunities(essays, [match("p1", "ready-to-reuse")], [{ id: "p1", isCurrentCycle: true, assignedEssay: { id: "essay-9" } }]);
    expect(groups).toHaveLength(0);
  });

  // "No reuse story" now means no shared theme either: a weak match that does
  // share one is a real (if distant) option, so the fixture has to have nothing
  // in common for this to still test what it means to test.
  it("drops essays with no reuse story at all", () => {
    const unrelated = { ...match("p1", "new-response"), matchedThemes: [] as string[] };
    expect(reuseOpportunities(essays, [unrelated], [{ id: "p1", isCurrentCycle: true, assignedEssay: null }])).toEqual([]);
  });

  // The page used to say "nothing matches closely enough" whenever the strong
  // bucket was empty, hiding every weaker candidate and reading as an empty
  // page. These are offered separately instead - and deliberately not counted
  // as reusable, so the "reusable now" tile does not inflate.
  it("surfaces a weak match that still shares a theme, without calling it reusable", () => {
    const groups = reuseOpportunities(
      essays,
      // new-response: the content genuinely does not answer the prompt.
      [match("p1", "new-response", 20)],
      [{ id: "p1", isCurrentCycle: true, assignedEssay: null }],
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].open).toEqual([]);
    expect(groups[0].withEdits).toEqual([]);
    expect(groups[0].possible.map((row) => row.promptId)).toEqual(["p1"]);
  });

  it("keeps a school-specific match out of the weaker-options list", () => {
    const groups = reuseOpportunities(
      essays,
      [match("p1", "major-adaptation", 80, "high")],
      [{ id: "p1", isCurrentCycle: true, assignedEssay: null }],
    );
    expect(groups[0].withEdits.map((row) => row.promptId)).toEqual(["p1"]);
    expect(groups[0].possible).toEqual([]);
  });
  // reuseOpportunities had no cycle filter while summarizePrompts did, so a
  // previous-cycle prompt could be offered as live reuse work while being
  // excluded from every count. That is why the reuse tallies never reconciled
  // with the prompt list.
  it("never offers a previous-cycle prompt as a reuse opportunity", () => {
    const groups = reuseOpportunities(
      essays,
      [match("p1", "ready-to-reuse"), match("p2", "ready-to-reuse")],
      [
        { id: "p1", isCurrentCycle: false, assignedEssay: null },
        { id: "p2", isCurrentCycle: true, assignedEssay: null },
      ],
    );
    expect(groups[0].open.map((row) => row.promptId)).toEqual(["p2"]);
  });

  it("drops an essay whose only opportunity was a previous-cycle prompt", () => {
    expect(reuseOpportunities(
      essays,
      [match("p1", "ready-to-reuse")],
      [{ id: "p1", isCurrentCycle: false, assignedEssay: null }],
    )).toEqual([]);
  });
  // The three user-facing states must be disjoint and must mean what they say.
  // A school-specific essay with strong content used to land in a "do not reuse
  // here / write those fresh" bucket, which is "new response" by another name.
  describe("three reuse states", () => {
    const withRisk = (id: string, action: string, risk: string) =>
      ({ ...match(id, action, 80, risk), adaptationRequired: risk !== "low" });

    it("puts a clean strong match in ready, not with-edits", () => {
      const g = reuseOpportunities(essays, [withRisk("p1", "ready-to-reuse", "low")],
        [{ id: "p1", isCurrentCycle: true, assignedEssay: null }])[0];
      expect(g.open.map((r) => r.promptId)).toEqual(["p1"]);
      expect(g.withEdits).toEqual([]);
    });

    it("puts a strong match that names another school in with-edits, and still recommends it", () => {
      const g = reuseOpportunities(essays, [withRisk("p1", "major-adaptation", "high")],
        [{ id: "p1", isCurrentCycle: true, assignedEssay: null }])[0];
      expect(g.withEdits.map((r) => r.promptId)).toEqual(["p1"]);
      expect(g.open).toEqual([]);
      expect(g.possible).toEqual([]);
    });

    it("counts with-edits as a genuine reuse opportunity", () => {
      const g = reuseOpportunities(essays, [withRisk("p1", "minor-adaptation", "medium")],
        [{ id: "p1", isCurrentCycle: true, assignedEssay: null }])[0];
      expect(g.withEdits.map((r) => r.promptId)).toEqual(["p1"]);
    });

    it("keeps a weak content match out of both recommendation buckets", () => {
      const g = reuseOpportunities(essays, [withRisk("p1", "new-response", "high")],
        [{ id: "p1", isCurrentCycle: true, assignedEssay: null }])[0];
      expect(g.open).toEqual([]);
      expect(g.withEdits).toEqual([]);
      expect(g.possible.map((r) => r.promptId)).toEqual(["p1"]);
    });
  });
});
