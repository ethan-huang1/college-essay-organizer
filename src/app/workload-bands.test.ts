import { describe, expect, it } from "vitest";

import { bandsReconcile, workloadBands, type BandKey } from "./workload-bands";
import { summarizeWorkload, type WorkloadPrompt, type WorkloadSchool } from "@/lib/workload";
import type { WorkspaceSnapshot } from "@/lib/workspaces";

/**
 * The bands are a re-presentation of numbers `summarizeWorkload` already
 * produced, so the property that matters is that they never invent or lose an
 * essay: completed plus the four editing bands must equal the required total,
 * whatever shape the workload has.
 */

const school = { id: "s1", name: "Brown University", selectedPrograms: [] } as unknown as WorkloadSchool;

let counter = 0;
function prompt(overrides: Partial<WorkloadPrompt> & { actions?: string[] } = {}): WorkloadPrompt {
  const { actions = [], ...rest } = overrides;
  counter += 1;
  return {
    id: `p${counter}`,
    schoolId: "s1",
    status: "not-started",
    isCurrentCycle: true,
    assignedEssay: null,
    suggestedMatches: actions.map((action, index) => ({
      essayId: `e${index}`, essayTitle: "Essay", score: 70, recommendedAction: action,
    })),
    requirement: "required",
    groupKey: null,
    groupLabel: null,
    groupRequiredCount: null,
    programKey: null,
    programLabel: null,
    sharedApplicationKey: null,
    canonicalKey: null,
    ...rest,
  } as WorkloadPrompt;
}

const summarize = (prompts: WorkloadPrompt[]) =>
  summarizeWorkload(prompts, { schools: [school], scope: "aggregate" });

const asSnapshot = (prompts: WorkloadPrompt[]) =>
  ({ prompts, schools: [school], essays: [], matches: [], families: [] } as unknown as WorkspaceSnapshot);

const countOf = (prompts: WorkloadPrompt[]) => {
  const summary = summarize(prompts);
  const bands = workloadBands(asSnapshot(prompts), summary);
  expect(bandsReconcile(bands, summary), "bands must sum to requiredTotal").toBe(true);
  return Object.fromEntries(bands.map((band) => [band.key, band.count])) as Record<BandKey, number>;
};

describe("workload bands", () => {
  it("puts a finished prompt in completed and nowhere else", () => {
    expect(countOf([prompt({ status: "complete" })])).toEqual({
      completed: 1, slight: 0, moderate: 0, major: 0, scratch: 0,
    });
  });

  it("reads the band the matcher already assigned", () => {
    expect(countOf([
      prompt({ actions: ["reusable-slight-edits"] }),
      prompt({ actions: ["reusable-edits"] }),
      prompt({ actions: ["reusable-significant-edits"] }),
      prompt({ actions: ["new-response"] }),
    ])).toEqual({ completed: 0, slight: 1, moderate: 1, major: 1, scratch: 1 });
  });

  it("takes the best band on offer when several essays match", () => {
    // The student would obviously reuse the closest essay, which is the same
    // one the reuse view recommends.
    expect(countOf([
      prompt({ actions: ["new-response", "reusable-slight-edits", "reusable-edits"] }),
    ])).toEqual({ completed: 0, slight: 1, moderate: 0, major: 0, scratch: 0 });
  });

  it("counts a prompt with no candidate essay as write-from-scratch", () => {
    expect(countOf([prompt()])).toEqual({
      completed: 0, slight: 0, moderate: 0, major: 0, scratch: 1,
    });
  });

  it("counts a choose-N set by what it still requires, not by its size", () => {
    // Four prompts, answer two: the workload is two essays, and the two easiest
    // are the ones a student would pick.
    const set = [
      prompt({ groupKey: "piq", groupRequiredCount: 2, actions: ["reusable-slight-edits"] }),
      prompt({ groupKey: "piq", groupRequiredCount: 2, actions: ["reusable-edits"] }),
      prompt({ groupKey: "piq", groupRequiredCount: 2, actions: ["new-response"] }),
      prompt({ groupKey: "piq", groupRequiredCount: 2, actions: ["new-response"] }),
    ];
    expect(countOf(set)).toEqual({ completed: 0, slight: 1, moderate: 1, major: 0, scratch: 0 });
  });

  it("does not double-count a partly finished choose-N set", () => {
    const set = [
      prompt({ groupKey: "piq", groupRequiredCount: 2, status: "complete" }),
      prompt({ groupKey: "piq", groupRequiredCount: 2, actions: ["reusable-edits"] }),
      prompt({ groupKey: "piq", groupRequiredCount: 2, actions: ["new-response"] }),
    ];
    expect(countOf(set)).toEqual({ completed: 1, slight: 0, moderate: 1, major: 0, scratch: 0 });
  });

  it("ignores optional and previous-cycle prompts, as the counts do", () => {
    expect(countOf([
      prompt({ requirement: "optional", actions: ["reusable-slight-edits"] }),
      prompt({ isCurrentCycle: false, actions: ["reusable-slight-edits"] }),
      prompt({ actions: ["new-response"] }),
    ])).toEqual({ completed: 0, slight: 0, moderate: 0, major: 0, scratch: 1 });
  });

  it("treats an assigned essay as finished", () => {
    expect(countOf([
      prompt({ assignedEssay: { id: "e1", title: "The Metronome" } }),
    ])).toEqual({ completed: 1, slight: 0, moderate: 0, major: 0, scratch: 0 });
  });

  it("reconciles on an empty workspace", () => {
    expect(countOf([])).toEqual({ completed: 0, slight: 0, moderate: 0, major: 0, scratch: 0 });
  });
});
