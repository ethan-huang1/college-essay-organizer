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
    matchedThemes: ["Community & Contribution"],
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
    expect(groups[0].open.map((row) => row.promptId)).toEqual(["p2"]);
    expect(groups[0].risky).toEqual([]);
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

  it("keeps an institution-specific risk visible even though it is not reusable", () => {
    const groups = reuseOpportunities(
      essays,
      [match("p1", "major-adaptation", 30, "high"), match("p2", "ready-to-reuse")],
      [{ id: "p1", isCurrentCycle: true, assignedEssay: null }, { id: "p2", isCurrentCycle: true, assignedEssay: null }],
    );

    expect(groups[0].risky.map((row) => row.promptId)).toEqual(["p1"]);
    expect(groups[0].open.map((row) => row.promptId)).toEqual(["p2"]);
  });

  it("surfaces an essay whose only match is a risky one", () => {
    const groups = reuseOpportunities(
      essays,
      [match("p1", "major-adaptation", 30, "high")],
      [{ id: "p1", isCurrentCycle: true, assignedEssay: null }],
    );

    expect(groups).toHaveLength(1);
    expect(groups[0].open).toEqual([]);
    expect(groups[0].risky).toHaveLength(1);
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
      [match("p1", "major-adaptation", 40)],
      [{ id: "p1", isCurrentCycle: true, assignedEssay: null }],
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].open).toEqual([]);
    expect(groups[0].possible.map((row) => row.promptId)).toEqual(["p1"]);
  });

  it("keeps a high-risk match out of the weaker-options list", () => {
    const groups = reuseOpportunities(
      essays,
      [match("p1", "major-adaptation", 40, "high")],
      [{ id: "p1", isCurrentCycle: true, assignedEssay: null }],
    );
    expect(groups[0].risky.map((row) => row.promptId)).toEqual(["p1"]);
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
});
