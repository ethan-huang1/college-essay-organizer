import { describe, expect, it } from "vitest";

import { effectiveLimit, wordLimitNotes } from "./essay-guidance";

describe("wordLimitNotes", () => {
  it("says nothing when there is no limit to measure against", () => {
    expect(wordLimitNotes(300, {})).toEqual([]);
  });

  it("says nothing about an empty document", () => {
    // An untouched draft is not "1000 words short", it is untouched.
    expect(wordLimitNotes(0, { target: 250 })).toEqual([]);
  });

  it("names the number of words to cut when over the limit", () => {
    expect(wordLimitNotes(312, { target: 250 })).toEqual(["62 over the 250-word limit — cut 62"]);
  });

  it("is silent inside the limit", () => {
    expect(wordLimitNotes(250, { target: 250 })).toEqual([]);
    expect(wordLimitNotes(200, { target: 250 })).toEqual([]);
  });

  it("flags substantial expansion at the same 60% threshold matchAdjustments uses", () => {
    expect(wordLimitNotes(149, { promptMax: 250 })).toEqual(["149 of 250 words — needs substantial expansion"]);
    expect(wordLimitNotes(150, { promptMax: 250 })).toEqual([]);
  });

  it("reports a prompt minimum separately from the maximum", () => {
    expect(wordLimitNotes(120, { promptMax: 650, promptMin: 250 })).toEqual([
      "120 of 650 words — needs substantial expansion",
      "under this prompt's 250-word minimum",
    ]);
  });

  it("prefers the essay's own target over the prompt's maximum", () => {
    expect(effectiveLimit({ target: 150, promptMax: 650 })).toBe(150);
    expect(effectiveLimit({ target: null, promptMax: 650 })).toBe(650);
    expect(effectiveLimit({})).toBeNull();
  });
});
