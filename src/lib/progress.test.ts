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
    };
  }

  it("separates prompts the essay already answers from the ones it still could", () => {
    const groups = reuseOpportunities(
      essays,
      [match("p1", "ready-to-reuse"), match("p2", "minor-adaptation", 60), match("p3", "new-response", 20)],
      [
        { id: "p1", assignedEssay: { id: "essay-1" } },
        { id: "p2", assignedEssay: null },
        { id: "p3", assignedEssay: null },
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
      [{ id: "p1", assignedEssay: { id: "essay-1" } }],
    );

    expect(groups[0].inUse.map((row) => row.promptId)).toEqual(["p1"]);
    expect(groups[0].open).toEqual([]);
  });

  it("keeps an institution-specific risk visible even though it is not reusable", () => {
    const groups = reuseOpportunities(
      essays,
      [match("p1", "major-adaptation", 30, "high"), match("p2", "ready-to-reuse")],
      [{ id: "p1", assignedEssay: null }, { id: "p2", assignedEssay: null }],
    );

    expect(groups[0].risky.map((row) => row.promptId)).toEqual(["p1"]);
    expect(groups[0].open.map((row) => row.promptId)).toEqual(["p2"]);
  });

  it("surfaces an essay whose only match is a risky one", () => {
    const groups = reuseOpportunities(
      essays,
      [match("p1", "major-adaptation", 30, "high")],
      [{ id: "p1", assignedEssay: null }],
    );

    expect(groups).toHaveLength(1);
    expect(groups[0].open).toEqual([]);
    expect(groups[0].risky).toHaveLength(1);
  });

  it("does not flag a risk on a prompt another essay already answers", () => {
    const groups = reuseOpportunities(
      essays,
      [match("p1", "major-adaptation", 30, "high")],
      [{ id: "p1", assignedEssay: { id: "essay-9" } }],
    );

    expect(groups).toEqual([]);
  });

  it("leaves out prompts another essay already answers", () => {
    const groups = reuseOpportunities(essays, [match("p1", "ready-to-reuse")], [{ id: "p1", assignedEssay: { id: "essay-9" } }]);
    expect(groups).toHaveLength(0);
  });

  it("drops essays with no reuse story at all", () => {
    expect(reuseOpportunities(essays, [match("p1", "new-response")], [{ id: "p1", assignedEssay: null }])).toEqual([]);
  });
});
