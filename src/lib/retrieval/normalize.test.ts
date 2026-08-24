import { describe, expect, it } from "vitest";

import { normalizeWhitespace, promptContentChanged, validatePromptRecord, validateRecord } from "./normalize";
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

  it("rejects a previous-cycle record that still carries prompts", () => {
    const errors = validateRecord({ ...baseRecord, verificationStatus: "previous-cycle" });
    expect(errors.some((error) => error.includes("previous-cycle records must not carry prompts"))).toBe(true);
  });

  it("rejects officially-verified with no sourceUrl", () => {
    const errors = validateRecord({ ...baseRecord, sourceUrl: null });
    expect(errors.some((error) => error.includes("requires a sourceUrl"))).toBe(true);
  });

  it("rejects officially-verified with zero prompts as contradictory", () => {
    const errors = validateRecord({ ...baseRecord, prompts: [] });
    expect(errors.some((error) => error.includes("contradictory"))).toBe(true);
  });

  it("rejects duplicate externalRef values within one school", () => {
    const errors = validateRecord({ ...baseRecord, prompts: [basePrompt, { ...basePrompt, title: "Essay one again" }] });
    expect(errors.some((error) => error.includes("Duplicate externalRef"))).toBe(true);
  });

  it("a needs-review record may have zero prompts (a school with only unverifiable variants)", () => {
    expect(validateRecord({ ...baseRecord, verificationStatus: "needs-review", prompts: [] })).toEqual([]);
  });
});

describe("promptContentChanged", () => {
  const stored = { promptText: "Describe something meaningful to you.", minWordCount: null, maxWordCount: 250, minCharCount: null, maxCharCount: null };

  it("is false when wording and limits are identical (ignoring incidental whitespace)", () => {
    expect(promptContentChanged(stored, { ...basePrompt, promptText: "  Describe   something meaningful to you. " })).toBe(false);
  });

  it("is true when the wording differs", () => {
    expect(promptContentChanged(stored, { ...basePrompt, promptText: "Describe something meaningful to you now." })).toBe(true);
  });

  it("is true when a word-count limit differs", () => {
    expect(promptContentChanged(stored, { ...basePrompt, maxWordCount: 300 })).toBe(true);
  });
});
