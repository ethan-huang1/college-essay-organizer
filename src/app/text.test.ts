import { describe, expect, it } from "vitest";

import { sentenceCase, sentenceList, statusLabel } from "./text";

/**
 * The rule these encode: capitalise the sentence, never re-case the words
 * inside it. The matcher's phrases carry category names and acronyms that a
 * title-caser or a lowercaser would both damage.
 */

describe("sentenceCase", () => {
  it("capitalises the first letter and leaves the rest alone", () => {
    expect(sentenceCase("may not address Why Major themes")).toBe("May not address Why Major themes");
  });

  it("preserves acronyms and proper nouns anywhere in the phrase", () => {
    expect(sentenceCase("names another school → replace school-specific language"))
      .toBe("Names another school → replace school-specific language");
    expect(sentenceCase("check PLME requirements first")).toBe("Check PLME requirements first");
  });

  it("leaves an already-capitalised phrase untouched", () => {
    expect(sentenceCase("Reusable with slight edits")).toBe("Reusable with slight edits");
  });

  it("skips leading characters that carry no case", () => {
    // "248 words → cut to 150" must not lose its number, and a quoted phrase
    // capitalises the first real letter rather than giving up.
    expect(sentenceCase("248 words → cut to 150")).toBe("248 words → cut to 150");
    expect(sentenceCase('"why us" prompts need this')).toBe('"Why us" prompts need this');
  });

  it("handles empty and whitespace-only input", () => {
    expect(sentenceCase("")).toBe("");
    expect(sentenceCase("   ")).toBe("");
  });

  it("trims only the leading space, so the label cannot start with a gap", () => {
    expect(sentenceCase("  may not address")).toBe("May not address");
  });
});

describe("sentenceList", () => {
  it("capitalises every phrase, not just the first", () => {
    expect(sentenceList(["248 words → cut to 150", "names another school"]))
      .toBe("248 words → cut to 150 · Names another school");
  });

  it("returns an empty string for no phrases", () => {
    expect(sentenceList([])).toBe("");
  });
});

describe("statusLabel", () => {
  it("reads a hyphenated work state as a sentence", () => {
    expect(statusLabel("not-started")).toBe("Not started");
    expect(statusLabel("in-progress")).toBe("In progress");
    expect(statusLabel("complete")).toBe("Complete");
  });

  it("reads the essay vocabulary the same way", () => {
    expect(statusLabel("idea")).toBe("Idea");
    expect(statusLabel("draft")).toBe("Draft");
    expect(statusLabel("revising")).toBe("Revising");
    expect(statusLabel("submitted")).toBe("Submitted");
  });
});
