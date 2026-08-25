import { describe, expect, it } from "vitest";

import { normalizeWhitespace, promptContentChanged, validateCanonicalAgreement, validatePromptRecord, validateRecord } from "./normalize";
import type { RawPromptRecord, SchoolSourceRecord } from "./types";

const basePrompt: RawPromptRecord = {
  externalRef: "essay-1",
  title: "Essay one",
  promptText: "Describe something meaningful to you.",
  maxWordCount: 250,
  requirement: "required",
};

const baseRecord: SchoolSourceRecord = {
  schoolName: "Example University",
  cycleLabel: "2026–27",
  verificationStatus: "officially-verified",
  applicationPlatform: "common-app",
  sourceUrl: "https://example.edu/essays",
  retrievedAt: "2026-08-24",
  note: "Official example admissions page.",
  prompts: [basePrompt],
};

describe("normalizeWhitespace", () => {
  it("collapses internal whitespace and trims the ends", () => {
    expect(normalizeWhitespace("  Hello   world  \n")).toBe("Hello world");
  });
});

describe("validatePromptRecord", () => {
  it("accepts a well-formed required prompt", () => {
    expect(validatePromptRecord(basePrompt)).toEqual([]);
  });

  it("rejects a missing externalRef, title, or promptText", () => {
    expect(validatePromptRecord({ ...basePrompt, externalRef: "" })).toContain("externalRef is required.");
    expect(validatePromptRecord({ ...basePrompt, title: "" })).toContain("title is required.");
    expect(validatePromptRecord({ ...basePrompt, promptText: "" })).toContain("promptText is required.");
  });

  it("rejects inverted word and character count ranges", () => {
    expect(validatePromptRecord({ ...basePrompt, minWordCount: 300, maxWordCount: 100 })).toContain("minWordCount exceeds maxWordCount.");
    expect(validatePromptRecord({ ...basePrompt, minCharCount: 300, maxCharCount: 100 })).toContain("minCharCount exceeds maxCharCount.");
  });

  it("requires a conditionalNote when requirement is conditional", () => {
    expect(validatePromptRecord({ ...basePrompt, requirement: "conditional" }))
      .toContain("conditional prompts require a conditionalNote explaining when they apply.");
    expect(validatePromptRecord({ ...basePrompt, requirement: "conditional", conditionalNote: "Engineering applicants only." })).toEqual([]);
  });
});

describe("validateRecord", () => {
  it("accepts a well-formed officially-verified record", () => {
    expect(validateRecord(baseRecord)).toEqual([]);
  });

  it("accepts a well-formed previous-cycle record with its actual (older) cycle and prompts", () => {
    const errors = validateRecord({ ...baseRecord, verificationStatus: "previous-cycle", cycleLabel: "2025–26" });
    expect(errors).toEqual([]);
  });

  it("rejects a previous-cycle record left labeled with the current cycle", () => {
    const errors = validateRecord({ ...baseRecord, verificationStatus: "previous-cycle" });
    expect(errors.some((error) => error.includes("must set cycleLabel to the actual (older) cycle"))).toBe(true);
  });

  it("rejects a previous-cycle record with zero prompts as contradictory", () => {
    const errors = validateRecord({ ...baseRecord, verificationStatus: "previous-cycle", cycleLabel: "2025–26", prompts: [] });
    expect(errors.some((error) => error.includes("contradictory"))).toBe(true);
  });

  it("rejects officially-verified with no sourceUrl", () => {
    const errors = validateRecord({ ...baseRecord, sourceUrl: null });
    expect(errors.some((error) => error.includes("requires a sourceUrl"))).toBe(true);
  });

  it("rejects officially-verified with zero prompts as contradictory", () => {
    const errors = validateRecord({ ...baseRecord, prompts: [] });
    expect(errors.some((error) => error.includes("contradictory"))).toBe(true);
  });

  it("accepts a well-formed no-supplement-confirmed record (sourceUrl required, zero prompts required)", () => {
    const errors = validateRecord({ ...baseRecord, verificationStatus: "no-supplement-confirmed", prompts: [] });
    expect(errors).toEqual([]);
  });

  it("rejects no-supplement-confirmed with prompts attached", () => {
    const errors = validateRecord({ ...baseRecord, verificationStatus: "no-supplement-confirmed" });
    expect(errors.some((error) => error.includes("must not carry prompts"))).toBe(true);
  });

  it("rejects needs-review with prompts attached", () => {
    const errors = validateRecord({ ...baseRecord, verificationStatus: "needs-review" });
    expect(errors.some((error) => error.includes("must not carry prompts"))).toBe(true);
  });

  it("rejects duplicate externalRef values within one school", () => {
    const errors = validateRecord({ ...baseRecord, prompts: [basePrompt, { ...basePrompt, title: "Essay one again" }] });
    expect(errors.some((error) => error.includes("Duplicate externalRef"))).toBe(true);
  });

  it("a needs-review record may have zero prompts (a school with only unverifiable variants)", () => {
    expect(validateRecord({ ...baseRecord, verificationStatus: "needs-review", prompts: [] })).toEqual([]);
  });

  // A group asking for more than it contains, or a prompt pointing at a group
  // nobody declared, would make the required count meaningless.
  it("rejects a group that asks for more prompts than it holds", () => {
    const errors = validateRecord({
      ...baseRecord,
      prompts: [{ ...basePrompt, groupKey: "set" }],
      promptGroups: [{ key: "set", label: "Pick some", requiredCount: 3 }],
    });
    expect(errors.some((error) => error.includes("asks for 3 of only 1"))).toBe(true);
  });

  it("rejects a prompt referencing an undeclared group", () => {
    const errors = validateRecord({ ...baseRecord, prompts: [{ ...basePrompt, groupKey: "nope" }] });
    expect(errors.some((error) => error.includes('undeclared group "nope"'))).toBe(true);
  });

  it("rejects a declared group no prompt belongs to", () => {
    const errors = validateRecord({
      ...baseRecord,
      promptGroups: [{ key: "orphan", label: "Nobody", requiredCount: 1 }],
    });
    expect(errors.some((error) => error.includes("no prompt carries that groupKey"))).toBe(true);
  });

  it("accepts a well-formed choose-N group", () => {
    expect(validateRecord({
      ...baseRecord,
      prompts: [
        { ...basePrompt, externalRef: "a", groupKey: "set" },
        { ...basePrompt, externalRef: "b", groupKey: "set" },
      ],
      promptGroups: [{ key: "set", label: "Answer either", requiredCount: 1 }],
    })).toEqual([]);
  });
});

describe("validateCanonicalAgreement", () => {
  const campus = (schoolName: string, over: Partial<RawPromptRecord> = {}): SchoolSourceRecord => ({
    ...baseRecord,
    schoolName,
    sharedApplicationKey: "shared-app",
    prompts: [{ ...basePrompt, groupKey: "set", ...over }],
    promptGroups: [{ key: "set", label: "Answer either", requiredCount: 1 }],
  });

  it("accepts campuses that agree about a shared prompt", () => {
    expect(validateCanonicalAgreement([campus("Campus A"), campus("Campus B")])).toEqual([]);
  });

  // Without this the app would collapse the two into one row and the winner
  // would depend on registry order.
  it("rejects campuses that disagree about wording or limits", () => {
    const wording = validateCanonicalAgreement([campus("Campus A"), campus("Campus B", { promptText: "Something else entirely." })]);
    expect(wording).toHaveLength(1);
    expect(wording[0]).toContain("promptText");

    const limit = validateCanonicalAgreement([campus("Campus A"), campus("Campus B", { maxWordCount: 400 })]);
    expect(limit[0]).toContain("maxWordCount");
  });

  it("rejects campuses that disagree about group membership or required count", () => {
    const membership = validateCanonicalAgreement([campus("Campus A"), campus("Campus B", { groupKey: undefined })]);
    expect(membership[0]).toContain("groupKey");

    const disagreeingCount: SchoolSourceRecord = {
      ...campus("Campus B"),
      promptGroups: [{ key: "set", label: "Answer either", requiredCount: 1 }],
      prompts: [
        { ...basePrompt, groupKey: "set" },
        { ...basePrompt, externalRef: "filler", groupKey: "set" },
      ],
    };
    const countErrors = validateCanonicalAgreement([
      campus("Campus A"),
      { ...disagreeingCount, promptGroups: [{ key: "set", label: "Answer either", requiredCount: 2 }] },
    ]);
    expect(countErrors.some((error) => error.includes("groupRequiredCount"))).toBe(true);
  });

  it("ignores records that share no application", () => {
    expect(validateCanonicalAgreement([
      { ...baseRecord, schoolName: "A" },
      { ...baseRecord, schoolName: "B", prompts: [{ ...basePrompt, promptText: "Totally different." }] },
    ])).toEqual([]);
  });
});

describe("promptContentChanged", () => {
  const stored = {
    title: "Essay one",
    promptText: "Describe something meaningful to you.",
    minWordCount: null,
    maxWordCount: 250,
    minCharCount: null,
    maxCharCount: null,
    requirement: "required",
    conditionalNote: null,
    groupKey: null,
    groupRequiredCount: null,
    programKey: null,
  };

  it("is false when wording and limits are identical (ignoring incidental whitespace)", () => {
    expect(promptContentChanged(stored, { ...basePrompt, promptText: "  Describe   something meaningful to you. " })).toBe(false);
  });

  it("is true when the wording differs", () => {
    expect(promptContentChanged(stored, { ...basePrompt, promptText: "Describe something meaningful to you now." })).toBe(true);
  });

  it("is true when a word-count limit differs", () => {
    expect(promptContentChanged(stored, { ...basePrompt, maxWordCount: 300 })).toBe(true);
  });

  // These four used to report "unchanged", so a re-import could never deliver
  // newly encoded metadata to a workspace that already held the row.
  it("is true when the title, requirement, or conditional note differs", () => {
    expect(promptContentChanged(stored, { ...basePrompt, title: "Essay one, reworded" })).toBe(true);
    expect(promptContentChanged(stored, {
      ...basePrompt,
      requirement: "conditional",
      conditionalNote: "Only nursing applicants answer this.",
    })).toBe(true);
  });

  it("is true when newly encoded group or program metadata arrives", () => {
    expect(promptContentChanged(stored, { ...basePrompt, groupKey: "uc-piq" }, 4)).toBe(true);
    expect(promptContentChanged(stored, { ...basePrompt, programKey: "wharton" })).toBe(true);
    // A group whose required count changes is a different ask.
    expect(promptContentChanged({ ...stored, groupKey: "uc-piq", groupRequiredCount: 4 }, { ...basePrompt, groupKey: "uc-piq" }, 3)).toBe(true);
  });
});
