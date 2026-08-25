import { describe, expect, it } from "vitest";

import { canonicalPromptGroups, conditionalState, summarizeWorkload, type WorkloadPrompt, type WorkloadSchool } from "./workload";

const UC_CAMPUSES = ["berkeley", "ucla", "davis", "irvine", "san-diego"];

function prompt(over: Partial<WorkloadPrompt> & { id: string }): WorkloadPrompt {
  return {
    schoolId: "school-1",
    status: "not-started",
    isCurrentCycle: true,
    assignedEssay: null,
    suggestedMatches: [],
    requirement: "required",
    canonicalKey: null,
    sharedApplicationKey: null,
    groupKey: null,
    groupLabel: null,
    groupRequiredCount: null,
    programKey: null,
    programLabel: null,
    ...over,
  };
}

/** Eight Personal Insight Questions, "answer any 4", per campus. */
function piqs(schoolId: string, completeCount = 0): WorkloadPrompt[] {
  return Array.from({ length: 8 }, (_, index) =>
    prompt({
      id: `${schoolId}-piq-${index + 1}`,
      schoolId,
      requirement: "optional",
      canonicalKey: `university-of-california:piq-${index + 1}`,
      sharedApplicationKey: "university-of-california",
      groupKey: "uc-piq",
      groupLabel: "Personal Insight Questions",
      groupRequiredCount: 4,
      status: index < completeCount ? "complete" : "not-started",
    }));
}

const ucSchools: WorkloadSchool[] = UC_CAMPUSES.map((id) => ({ id, name: `UC ${id}`, selectedPrograms: null }));

const aggregate = (prompts: WorkloadPrompt[], schools: readonly WorkloadSchool[] = ucSchools) =>
  summarizeWorkload(prompts, { schools, scope: "aggregate" });

describe("choose-N prompt groups", () => {
  it("requires only what the school asks for, not the size of the set", () => {
    const summary = aggregate(piqs("berkeley"));
    expect(summary.requiredTotal).toBe(4);
    expect(summary.requiredRemaining).toBe(4);
    // The eight prompts are all still there and still answerable.
    expect(summary.total).toBe(8);
  });

  it("reaches 100% once the asked-for number is answered", () => {
    const summary = aggregate(piqs("berkeley", 4));
    expect(summary.requiredComplete).toBe(4);
    expect(summary.requiredRemaining).toBe(0);
  });

  // Without clamping this read as 5 of 4 done, which is how progress used to
  // exceed 100%.
  it("clamps a set answered more times than required", () => {
    const summary = aggregate(piqs("berkeley", 5));
    expect(summary.requiredComplete).toBe(4);
    expect(summary.requiredRemaining).toBe(0);
  });

  it("counts a choose-1-of-3 set as exactly one essay", () => {
    const summary = aggregate(
      Array.from({ length: 3 }, (_, index) =>
        prompt({
          id: `yale-${index}`,
          requirement: "optional",
          groupKey: "yale-short",
          groupLabel: "Short takes",
          groupRequiredCount: 1,
        })),
      [{ id: "school-1", name: "Yale", selectedPrograms: null }],
    );
    expect(summary.requiredTotal).toBe(1);
  });
});

describe("canonical shared prompts", () => {
  const allCampuses = UC_CAMPUSES.flatMap((id) => piqs(id));

  it("renders five campuses' shared questions once each, naming every campus", () => {
    const groups = canonicalPromptGroups(allCampuses, ucSchools);
    expect(groups).toHaveLength(8);
    expect(groups[0].schools.map((school) => school.id)).toEqual(UC_CAMPUSES);
    expect(groups[0].instanceIds).toHaveLength(5);
    // A single campus still sees its own eight.
    expect(canonicalPromptGroups(piqs("ucla"), ucSchools)).toHaveLength(8);
  });

  it("counts five campuses' shared set as four essays, not twenty", () => {
    const summary = aggregate(allCampuses);
    expect(summary.requiredTotal).toBe(4);
    // The group has to know every campus that asks, not just whichever
    // instance survived the collapse.
    expect(summary.groups).toHaveLength(1);
    expect(summary.groups[0].schools.map((school) => school.id).sort()).toEqual([...UC_CAMPUSES].sort());
    // Scoped to one campus it is still that campus's own four.
    expect(summarizeWorkload(piqs("ucla"), { schools: ucSchools, scope: "school" }).requiredTotal).toBe(4);
  });

  // The write path keeps canonical siblings in lockstep, so an assignment made
  // through one campus is present on all of them. These two tests pin the
  // read side: the aggregate must see it, and it must satisfy the requirement
  // for every campus rather than just the one acted on.
  it("shows an assignment made through one campus on the aggregate prompt", () => {
    const withAssignment = allCampuses.map((candidate) =>
      candidate.canonicalKey === "university-of-california:piq-1"
        ? { ...candidate, assignedEssay: { id: "essay-1", title: "The woodshop" } }
        : candidate);

    const summary = aggregate(withAssignment);
    expect(summary.requiredComplete).toBe(1);
    expect(summary.requiredRemaining).toBe(3);
  });

  it("satisfies the requirement for every campus from one shared assignment", () => {
    const withAssignment = allCampuses.map((candidate) =>
      candidate.canonicalKey === "university-of-california:piq-1"
        ? { ...candidate, assignedEssay: { id: "essay-1", title: "The woodshop" } }
        : candidate);

    for (const campus of UC_CAMPUSES) {
      const perSchool = summarizeWorkload(withAssignment.filter((candidate) => candidate.schoolId === campus), {
        schools: ucSchools,
        scope: "school",
      });
      expect(perSchool.requiredComplete).toBe(1);
    }
  });

  it("keeps the shared requirement satisfied after one campus is removed", () => {
    const withAssignment = allCampuses.map((candidate) =>
      candidate.canonicalKey === "university-of-california:piq-1"
        ? { ...candidate, assignedEssay: { id: "essay-1", title: "The woodshop" } }
        : candidate);
    // Berkeley is dropped from the list; its rows go with it.
    const remaining = withAssignment.filter((candidate) => candidate.schoolId !== "berkeley");

    const summary = aggregate(remaining);
    expect(summary.requiredTotal).toBe(4);
    expect(summary.requiredComplete).toBe(1);
  });
});

describe("conditional prompts", () => {
  const school = (selectedPrograms: string[] | null): WorkloadSchool[] => [
    { id: "school-1", name: "Penn", selectedPrograms },
  ];
  const wharton = prompt({
    id: "wharton-1",
    requirement: "conditional",
    programKey: "wharton",
    programLabel: "Wharton School",
  });

  it("counts a conditional prompt only for the programs the student selected", () => {
    expect(summarizeWorkload([wharton], { schools: school(["wharton"]), scope: "aggregate" }).requiredTotal).toBe(1);
    const other = summarizeWorkload([wharton], { schools: school(["nursing"]), scope: "aggregate" });
    expect(other.requiredTotal).toBe(0);
    expect(other.programSpecific).toBe(1);
  });

  it("treats never having been asked as unresolved rather than zero", () => {
    const summary = summarizeWorkload([wharton], { schools: school(null), scope: "aggregate" });
    expect(summary.requiredTotal).toBe(0);
    expect(summary.unresolvedConditional).toBe(1);
    expect(summary.unresolvedPrograms).toEqual([
      { schoolId: "school-1", schoolName: "Penn", programKey: "wharton", programLabel: "Wharton School" },
    ]);
  });

  it("settles at zero once the student answers 'no programs'", () => {
    const summary = summarizeWorkload([wharton], { schools: school([]), scope: "aggregate" });
    expect(summary.requiredTotal).toBe(0);
    expect(summary.unresolvedConditional).toBe(0);
    expect(summary.unresolvedPrograms).toEqual([]);
  });

  // A conditional prompt whose catalogue file is not encoded yet has no
  // programKey at all. It must not disappear, must not count as required, and
  // must not be silently treated as "same as before".
  it("surfaces an unencoded conditional prompt instead of hiding or requiring it", () => {
    const unencoded = prompt({ id: "unencoded", requirement: "conditional" });
    const summary = summarizeWorkload([unencoded], { schools: school(["wharton"]), scope: "aggregate" });
    expect(summary.requiredTotal).toBe(0);
    expect(summary.unresolvedConditional).toBe(1);
    // Nothing to ask about, so it raises no program question.
    expect(summary.unresolvedPrograms).toEqual([]);
    // Still present and still visible.
    expect(summary.total).toBe(1);
  });

  it("classifies conditional state directly", () => {
    expect(conditionalState(wharton, { selectedPrograms: ["wharton"] })).toBe("active");
    expect(conditionalState(wharton, { selectedPrograms: [] })).toBe("inactive");
    expect(conditionalState(wharton, { selectedPrograms: null })).toBe("unresolved");
    expect(conditionalState(wharton, undefined)).toBe("unresolved");
    expect(conditionalState(prompt({ id: "x" }), undefined)).toBe("active");
  });
});

describe("workload edges", () => {
  it("excludes previous-cycle prompts from every count", () => {
    const summary = aggregate([
      prompt({ id: "current" }),
      prompt({ id: "old", isCurrentCycle: false }),
      prompt({ id: "old-piq", isCurrentCycle: false, groupKey: "uc-piq", groupRequiredCount: 4 }),
    ], [{ id: "school-1", name: "Somewhere", selectedPrograms: null }]);
    expect(summary.requiredTotal).toBe(1);
    expect(summary.previousCycle).toBe(2);
  });

  it("counts an assigned but unfinished prompt toward the requirement", () => {
    const summary = aggregate(
      [prompt({ id: "assigned", status: "in-progress", assignedEssay: { id: "e", title: "Draft" } })],
      [{ id: "school-1", name: "Somewhere", selectedPrograms: null }],
    );
    expect(summary.requiredComplete).toBe(1);
  });

  it("never counts an optional prompt as required", () => {
    const summary = aggregate(
      [prompt({ id: "opt", requirement: "optional" }), prompt({ id: "req" })],
      [{ id: "school-1", name: "Somewhere", selectedPrograms: null }],
    );
    expect(summary.requiredTotal).toBe(1);
    expect(summary.optionalExtra).toBe(1);
  });
});
