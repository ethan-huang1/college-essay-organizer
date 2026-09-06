import { describe, expect, it } from "vitest";

import { TOP_UNIVERSITIES, canonicalizeUniversityName } from "./top-universities";

describe("canonicalizeUniversityName", () => {
  it("resolves an exact list entry regardless of case and spacing", () => {
    expect(canonicalizeUniversityName("stanford university")).toBe("Stanford University");
    expect(canonicalizeUniversityName("  Stanford   University ")).toBe("Stanford University");
  });

  it("resolves the short form of a campus-suffixed name to its canonical entry", () => {
    // The bug this exists for: Add College is free text, so typing the short
    // name created a "manual" school with no catalogue record and no prompts.
    expect(canonicalizeUniversityName("University of Maryland")).toBe("University of Maryland, College Park");
    expect(canonicalizeUniversityName("university of maryland")).toBe("University of Maryland, College Park");
    expect(canonicalizeUniversityName("University of North Carolina")).toBe("University of North Carolina at Chapel Hill");
    expect(canonicalizeUniversityName("University of Texas")).toBe("University of Texas at Austin");
  });

  it("leaves an ambiguous system name alone rather than picking a campus", () => {
    // Seven UC campuses claim this prefix, so there is no right answer; it
    // passes through as a manual entry the student can correct.
    expect(canonicalizeUniversityName("University of California")).toBe("University of California");
  });

  it("passes an off-list school through unchanged", () => {
    expect(canonicalizeUniversityName("Lakeview University")).toBe("Lakeview University");
  });

  it("resolves every alias target to a real list entry", () => {
    // An alias pointing at a name the registry does not carry would recreate
    // the original bug in a quieter form.
    for (const short of ["University of Maryland", "University of North Carolina", "University of Texas"]) {
      expect(TOP_UNIVERSITIES).toContain(canonicalizeUniversityName(short));
    }
  });

  it("is idempotent", () => {
    for (const name of ["University of Maryland", "stanford university", "Lakeview University"]) {
      const once = canonicalizeUniversityName(name);
      expect(canonicalizeUniversityName(once)).toBe(once);
    }
  });
});
