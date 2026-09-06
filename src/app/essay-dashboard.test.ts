import { describe, expect, it } from "vitest";

import { essaySchoolGroups, unattachedEssays, type DashboardEssay, type DashboardPrompt } from "./essay-dashboard";

/**
 * The dashboard's derivation, which is where "which required essays still need
 * writing" is decided. Every case here is one the old library view could not
 * express: a shared question, a draft that was never assigned, a prompt whose
 * status column was never touched, an essay with no college at all.
 */

const SCHOOLS = [
  { id: "s-brown", name: "Brown University", selectedPrograms: null },
  { id: "s-yale", name: "Yale University", selectedPrograms: null },
];

function prompt(overrides: Partial<DashboardPrompt> = {}): DashboardPrompt {
  return {
    id: "p1",
    schoolId: "s-brown",
    title: "Open Curriculum",
    status: "not-started",
    requirement: "required",
    isCurrentCycle: true,
    canonicalKey: null,
    sharedApplicationKey: null,
    groupKey: null,
    groupLabel: null,
    groupRequiredCount: null,
    programKey: null,
    programLabel: null,
    maxWordCount: 250,
    assignedEssay: null,
    suggestedMatches: [],
    ...overrides,
  };
}

function essay(overrides: Partial<DashboardEssay> = {}): DashboardEssay {
  return { id: "e1", title: "Brown Open Curriculum", originPromptId: null, linkedPrompts: [], ...overrides };
}

describe("essaySchoolGroups", () => {
  it("keeps a school with no prompts, rather than hiding it", () => {
    // "No supplemental essay required" and "we never looked" are different
    // facts, and dropping the school made them identical.
    const groups = essaySchoolGroups({ schools: SCHOOLS, prompts: [], essays: [] });
    expect(groups.map((group) => group.school.id)).toEqual(["s-brown", "s-yale"]);
    expect(groups[0].rows).toEqual([]);
    expect(groups[0].progress.requiredTotal).toBe(0);
  });

  it("reads an unwritten required prompt as not started", () => {
    const [brown] = essaySchoolGroups({ schools: SCHOOLS, prompts: [prompt()], essays: [] });
    expect(brown.byState["not-started"]).toHaveLength(1);
    expect(brown.byState["not-started"][0].essay).toBeNull();
    expect(brown.progress.requiredTotal).toBe(1);
    expect(brown.progress.requiredRemaining).toBe(1);
  });

  it("counts an assigned draft as in progress and names its document", () => {
    const assigned = essay({ id: "e-open", title: "Brown Open Curriculum", linkedPrompts: [{ id: "p1" }] });
    const [brown] = essaySchoolGroups({
      schools: SCHOOLS,
      prompts: [prompt({ assignedEssay: { id: "e-open", title: "Brown Open Curriculum" } })],
      essays: [assigned],
    });
    expect(brown.byState["in-progress"]).toHaveLength(1);
    expect(brown.byState["in-progress"][0].essay?.id).toBe("e-open");
  });

  it("finds a draft started from a prompt even when nothing is assigned", () => {
    // The status column is a manual field a student may never touch, so a
    // document that exists is the stronger signal that work has begun.
    const [brown] = essaySchoolGroups({
      schools: SCHOOLS,
      prompts: [prompt()],
      essays: [essay({ id: "e-origin", originPromptId: "p1" })],
    });
    expect(brown.byState["in-progress"][0].essay?.id).toBe("e-origin");
    expect(brown.byState["not-started"]).toEqual([]);
  });

  it("reads a complete prompt as complete whatever the matcher thinks", () => {
    const [brown] = essaySchoolGroups({
      schools: SCHOOLS,
      prompts: [prompt({ status: "submitted" })],
      essays: [],
    });
    expect(brown.byState.complete).toHaveLength(1);
    expect(brown.progress.requiredComplete).toBe(1);
  });

  it("collapses a question two campuses ask identically into one row each", () => {
    // Both campuses still show it - it is work at both - but neither shows it
    // twice, and the row names every school asking.
    const shared = { canonicalKey: "uc-pique", title: "Personal insight" };
    const groups = essaySchoolGroups({
      schools: SCHOOLS,
      prompts: [
        prompt({ id: "p-a", schoolId: "s-brown", ...shared }),
        prompt({ id: "p-b", schoolId: "s-brown", ...shared }),
        prompt({ id: "p-c", schoolId: "s-yale", ...shared }),
      ],
      essays: [],
    });
    expect(groups[0].rows).toHaveLength(1);
    expect(groups[0].rows[0].instanceIds).toEqual(["p-a", "p-b"]);
    expect(groups[1].rows).toHaveLength(1);
  });

  it("attaches a shared question's draft through any of its instances", () => {
    const shared = { canonicalKey: "uc-pique" };
    const [brown] = essaySchoolGroups({
      schools: SCHOOLS,
      prompts: [prompt({ id: "p-a", ...shared }), prompt({ id: "p-b", ...shared })],
      essays: [essay({ id: "e-shared", originPromptId: "p-b" })],
    });
    expect(brown.rows[0].essay?.id).toBe("e-shared");
    expect(brown.rows[0].state).toBe("in-progress");
  });
});

describe("unattachedEssays", () => {
  it("keeps an essay that belongs to no college on the list", () => {
    const library = essay({ id: "e-common", title: "The Metronome" });
    expect(unattachedEssays({ prompts: [prompt()], essays: [library] })).toEqual([library]);
  });

  it("excludes an essay attached by assignment or by origin", () => {
    const assigned = essay({ id: "e-a", linkedPrompts: [{ id: "p1" }] });
    const byOrigin = essay({ id: "e-b", originPromptId: "p1" });
    expect(unattachedEssays({ prompts: [prompt()], essays: [assigned, byOrigin] })).toEqual([]);
  });

  it("keeps an essay whose origin prompt has since been deleted", () => {
    // Its college is gone from the list; the writing is not.
    const orphan = essay({ id: "e-orphan", originPromptId: "p-gone" });
    expect(unattachedEssays({ prompts: [prompt()], essays: [orphan] })).toEqual([orphan]);
  });
});
