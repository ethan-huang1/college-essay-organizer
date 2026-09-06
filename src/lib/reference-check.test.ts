import { describe, expect, it } from "vitest";

import { findReferenceFlags, segmentContent, snippetAround } from "./reference-check";

const SCHOOLS = ["Princeton University", "Brown University", "Rice University"];

describe("findReferenceFlags", () => {
  it("flags Princeton in an essay reused for Brown (the reported bug)", () => {
    const content = "I loved my time at Princeton during senior year.";
    const flags = findReferenceFlags(content, {
      currentSchoolName: "Brown University",
      otherSchoolNames: SCHOOLS.filter((name) => name !== "Brown University"),
      schoolSpecificPhrases: [],
    });
    expect(flags).toHaveLength(1);
    expect(flags[0].kind).toBe("confirmed");
    expect(flags[0].text).toBe("Princeton");
  });

  it("does not flag the essay's own current school", () => {
    const content = "Brown University's Open Curriculum is why I applied.";
    const flags = findReferenceFlags(content, {
      currentSchoolName: "Brown University",
      otherSchoolNames: SCHOOLS.filter((name) => name !== "Brown University"),
      schoolSpecificPhrases: [],
    });
    expect(flags.some((flag) => flag.text.toLowerCase().includes("brown"))).toBe(false);
  });

  it("still uses schoolSpecificPhrases for names the school list wouldn't catch", () => {
    const content = "I spent hours in Firestone Library.";
    const flags = findReferenceFlags(content, {
      currentSchoolName: "Brown University",
      otherSchoolNames: [],
      schoolSpecificPhrases: ["Firestone Library"],
    });
    expect(flags).toHaveLength(1);
    expect(flags[0].kind).toBe("confirmed");
    expect(flags[0].text).toBe("Firestone Library");
  });

  it("flags every occurrence of a repeated name, each with its own span", () => {
    const content = "Princeton shaped me. Princeton is where I grew up.";
    const flags = findReferenceFlags(content, {
      currentSchoolName: "Brown University",
      otherSchoolNames: SCHOOLS.filter((name) => name !== "Brown University"),
      schoolSpecificPhrases: [],
    });
    expect(flags).toHaveLength(2);
    expect(flags[0].start).not.toBe(flags[1].start);
  });

  it("prefers a confirmed flag over a potential one at the same span", () => {
    const content = "I studied in Nassau Hall.";
    const flags = findReferenceFlags(content, {
      currentSchoolName: "Brown University",
      otherSchoolNames: [],
      schoolSpecificPhrases: ["Nassau Hall"],
    });
    expect(flags).toHaveLength(1);
    expect(flags[0].kind).toBe("confirmed");
    expect(flags[0].text).toBe("Nassau Hall");
  });

  it("flags a professor name as potential", () => {
    const content = "Professor Alvarez taught me how to think.";
    const flags = findReferenceFlags(content, {
      currentSchoolName: "Brown University",
      otherSchoolNames: [],
      schoolSpecificPhrases: [],
    });
    expect(flags).toHaveLength(1);
    expect(flags[0].kind).toBe("potential");
    expect(flags[0].text).toBe("Professor Alvarez");
  });

  it("flags a course code as potential, but not common acronym+number phrases", () => {
    const content = "I took COS 226 during the pandemic (COVID-19), unlike my SAT 1500 or ACT 34.";
    const flags = findReferenceFlags(content, {
      currentSchoolName: "Brown University",
      otherSchoolNames: [],
      schoolSpecificPhrases: [],
    });
    expect(flags.map((flag) => flag.text)).toEqual(["COS 226"]);
  });

  it("flags an undeclared building name via the institutional-noun pattern", () => {
    const content = "I spent hours at the Firestone Library.";
    const flags = findReferenceFlags(content, {
      currentSchoolName: "Brown University",
      otherSchoolNames: [],
      schoolSpecificPhrases: [],
    });
    expect(flags).toHaveLength(1);
    expect(flags[0].kind).toBe("potential");
    expect(flags[0].text).toBe("Firestone Library");
  });

  it("never flags the current school's own name, even embedded in a longer phrase", () => {
    const content = "I can't wait to cheer at Brown Stadium every weekend.";
    const flags = findReferenceFlags(content, {
      currentSchoolName: "Brown University",
      otherSchoolNames: SCHOOLS.filter((name) => name !== "Brown University"),
      schoolSpecificPhrases: [],
    });
    expect(flags).toHaveLength(0);
  });

  it("is pure: repeated calls on the same input never mutate it and return equal results", () => {
    const content = "Princeton shaped who I am today.";
    const params = {
      currentSchoolName: "Brown University",
      otherSchoolNames: SCHOOLS.filter((name) => name !== "Brown University"),
      schoolSpecificPhrases: [],
    };
    const first = findReferenceFlags(content, params);
    const second = findReferenceFlags(content, params);
    expect(content).toBe("Princeton shaped who I am today.");
    expect(second).toEqual(first);
  });
});

describe("segmentContent", () => {
  it("reconstructs the original content exactly, for no flags, one flag, and adjacent flags", () => {
    const fixtures: Array<{ content: string; flagRanges: Array<[number, number]> }> = [
      { content: "", flagRanges: [] },
      { content: "no flags here", flagRanges: [] },
      { content: "Princeton is here", flagRanges: [[0, 9]] },
      { content: "AB", flagRanges: [[0, 1], [1, 2]] },
      { content: "start Princeton", flagRanges: [[6, 15]] },
    ];
    for (const { content, flagRanges } of fixtures) {
      const flags = flagRanges.map(([start, end], index) => ({
        id: `f${index}`,
        kind: "confirmed" as const,
        text: content.slice(start, end),
        start,
        end,
        note: "note",
      }));
      const segments = segmentContent(content, flags);
      expect(segments.map((segment) => segment.text).join("")).toBe(content);
    }
  });
});

describe("snippetAround", () => {
  it("returns the full text untruncated when the flag is near short content", () => {
    const content = "Princeton shaped me.";
    const flag = { id: "f1", kind: "confirmed" as const, text: "Princeton", start: 0, end: 9, note: "" };
    expect(snippetAround(content, flag)).toBe("Princeton shaped me.");
  });

  it("truncates with an ellipsis only when the slice was actually cut", () => {
    const content = `${"x".repeat(60)} Princeton ${"y".repeat(60)}`;
    const flag = { id: "f1", kind: "confirmed" as const, text: "Princeton", start: 61, end: 70, note: "" };
    const snippet = snippetAround(content, flag, 10);
    expect(snippet.startsWith("…")).toBe(true);
    expect(snippet.endsWith("…")).toBe(true);
  });

  it("collapses embedded newlines into a single space", () => {
    const content = "line one\nPrinceton\nline two";
    const flag = { id: "f1", kind: "confirmed" as const, text: "Princeton", start: 9, end: 18, note: "" };
    expect(snippetAround(content, flag)).not.toContain("\n");
  });
});
