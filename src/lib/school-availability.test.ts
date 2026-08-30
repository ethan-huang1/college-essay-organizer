import { describe, expect, it } from "vitest";

import {
  availabilitySentence,
  schoolAvailability,
  schoolCatalogueState,
  type AvailabilityInput,
} from "./schools";
import { listCoveredSchoolNames, lookupSchoolSource } from "./retrieval/registry";

/**
 * "No required essays on file" was shown for five unrelated situations. These
 * tests pin each apart, and pin the two that are real work the required count
 * deliberately excludes.
 *
 * The catalogue is used as the fixture where possible, so a school whose record
 * changes shape cannot silently drift into the wrong sentence.
 */

const base: AvailabilityInput = {
  catalogueState: "current",
  promptCount: 0,
  requiredTotal: 0,
  optionalExtra: 0,
  programSpecific: 0,
  unresolvedConditional: 0,
};

const at = (overrides: Partial<AvailabilityInput>) => schoolAvailability({ ...base, ...overrides });
const say = (overrides: Partial<AvailabilityInput>) => availabilitySentence(at(overrides));

describe("school availability states stay distinct", () => {
  it("counts required essays when there are any", () => {
    expect(at({ requiredTotal: 4, promptCount: 4 })).toEqual({ kind: "required", count: 4 });
    expect(say({ requiredTotal: 4, promptCount: 4 })).toBe("4 required essays");
    expect(say({ requiredTotal: 1, promptCount: 1 })).toBe("1 required essay");
  });

  it("says a supplement is not required only when that was verified", () => {
    expect(say({ catalogueState: "no-supplement" })).toBe("No supplemental essay required");
  });

  it("never says that for unpublished, previous-cycle or unverified data", () => {
    // The bug this guards: all three of these used to read as "no required
    // essays", which is the same thing a student sees for a verified absence.
    for (const state of ["not-published", "previous-cycle-only", "needs-review", "manual"] as const) {
      expect(say({ catalogueState: state })).not.toMatch(/No supplemental essay/);
    }
    expect(say({ catalogueState: "not-published" })).toBe("Prompts not yet published");
    expect(say({ catalogueState: "previous-cycle-only" })).toBe("Current prompts not yet verified");
    expect(say({ catalogueState: "needs-review" })).toBe("Prompt information not yet verified");
    expect(say({ catalogueState: "manual" })).toBe("Prompt information not yet verified");
  });

  it("reports gated prompts as work awaiting an answer, not as no work", () => {
    // Georgetown's seven program-specific prompts and Amherst's three
    // conditional ones are excluded from requiredTotal on purpose. Telling the
    // student there is nothing to write is what was wrong.
    expect(at({ promptCount: 7, programSpecific: 7 })).toEqual({ kind: "awaiting-programs", count: 7 });
    expect(say({ promptCount: 3, unresolvedConditional: 3 })).toBe("3 depend on your programs");
    expect(say({ promptCount: 10, programSpecific: 7, unresolvedConditional: 3 }))
      .toBe("10 depend on your programs");
  });

  it("distinguishes optional-only from nothing on file", () => {
    expect(at({ promptCount: 2, optionalExtra: 2 })).toEqual({ kind: "optional-only", count: 2 });
    expect(say({ promptCount: 2, optionalExtra: 2 })).toBe("2 optional, none required");
  });

  it("treats a catalogue that claimed prompts but imported none as unverified", () => {
    // Not "no supplement": the importer expected prompts and produced none.
    expect(at({ catalogueState: "current", promptCount: 0 })).toEqual({ kind: "unverified" });
  });

  it("prefers a real required count over any catalogue caveat", () => {
    expect(at({ catalogueState: "needs-review", requiredTotal: 2, promptCount: 2 }))
      .toEqual({ kind: "required", count: 2 });
  });
});

describe("the catalogue's own schools land in the right state", () => {
  const record = (name: string) => {
    const found = lookupSchoolSource(name);
    expect(found, `${name} is not in the registry`).toBeTruthy();
    return found!;
  };

  /** What the app would compute for a school with no imported prompts. */
  const fromRecordWithNoPrompts = (name: string) => {
    const source = record(name);
    expect(source.prompts.length, `${name} unexpectedly has prompts now`).toBe(0);
    const catalogueState = schoolCatalogueState(
      source.verificationStatus === "no-supplement-confirmed" ? "no-supplement"
        : source.verificationStatus === "previous-cycle" ? "previous-cycle"
          : "current",
      [],
    );
    return schoolAvailability({ ...base, catalogueState });
  };

  it("Columbia is unverified, not a school with no supplement", () => {
    // Columbia publishes its questions only inside the Common App, so its
    // record carries no prompts. That is missing information, and the card must
    // not imply Columbia asks for nothing.
    const source = record("Columbia University");
    expect(source.prompts).toHaveLength(0);
    expect(source.verificationStatus).toBe("needs-review");
    expect(fromRecordWithNoPrompts("Columbia University")).toEqual({ kind: "unverified" });
    expect(availabilitySentence(fromRecordWithNoPrompts("Columbia University")))
      .toBe("Prompt information not yet verified");
  });

  it.each([
    "Arizona State University",
    "Carleton College",
    "University of North Carolina at Chapel Hill",
  ])("%s is a verified no-supplement school", (name) => {
    expect(record(name).verificationStatus).toBe("no-supplement-confirmed");
    expect(fromRecordWithNoPrompts(name)).toEqual({ kind: "no-supplement" });
  });

  it.each([
    "Boston University",
    "Cornell University",
    "University of Virginia",
  ])("%s has unverified prompt information", (name) => {
    expect(record(name).verificationStatus).toBe("needs-review");
    expect(fromRecordWithNoPrompts(name)).toEqual({ kind: "unverified" });
  });

  it("a previous-cycle-only school says its current prompts are unverified", () => {
    const previousCycle = listCoveredSchoolNames()
      .map((name) => ({ name, source: lookupSchoolSource(name)! }))
      .find((entry) => entry.source.verificationStatus === "previous-cycle" && entry.source.prompts.length > 0);
    expect(previousCycle, "the catalogue no longer has a previous-cycle school").toBeTruthy();

    const availability = schoolAvailability({ ...base, catalogueState: "previous-cycle-only", promptCount: 3 });
    expect(availability).toEqual({ kind: "previous-cycle" });
    expect(availabilitySentence(availability)).toBe("Current prompts not yet verified");
  });

  it("every school with conditional-only prompts reports them rather than reading as empty", () => {
    // Amherst, Boston College, Oberlin, Richmond, Villanova and Pitzer all
    // publish only conditional prompts.
    const conditionalOnly = listCoveredSchoolNames()
      .map((name) => ({ name, source: lookupSchoolSource(name)! }))
      .filter(({ source }) => source.prompts.length > 0
        && source.prompts.every((prompt) => prompt.requirement === "conditional"));

    expect(conditionalOnly.length, "expected the catalogue to contain conditional-only schools").toBeGreaterThan(0);
    for (const { name, source } of conditionalOnly) {
      const availability = schoolAvailability({
        ...base,
        promptCount: source.prompts.length,
        unresolvedConditional: source.prompts.length,
      });
      expect(availability.kind, `${name} reads as empty`).toBe("awaiting-programs");
    }
  });
});
