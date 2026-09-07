import { describe, expect, it } from "vitest";

import { groupRowsByWordCount } from "./prompt-grouping";

const row = (maxWordCount: number | null, id = "") => ({ id, prompt: { maxWordCount } });

describe("groupRowsByWordCount", () => {
  it("orders groups from most words to least", () => {
    const groups = groupRowsByWordCount([row(150), row(650), row(250)]);
    expect(groups.map((g) => g.label)).toEqual(["650 words", "250 words", "150 words"]);
  });

  it("keeps prompts with no stated limit last, not first", () => {
    // The trap: NO_LIMIT is +Infinity, so a plain descending comparator would
    // float "no word limit" to the top as if it were the longest essay.
    const groups = groupRowsByWordCount([row(null), row(100), row(500)]);
    expect(groups.map((g) => g.label)).toEqual(["500 words", "100 words", "Other / no word limit"]);
  });

  it("puts every unlimited prompt in one group even when they lead the input", () => {
    const groups = groupRowsByWordCount([row(null, "a"), row(null, "b"), row(300, "c")]);
    expect(groups).toHaveLength(2);
    expect(groups[0].label).toBe("300 words");
    expect(groups[1].rows.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("preserves the caller's order within a shared word count", () => {
    // Same bucket, so this is the ranking canonicalRows already applied.
    const groups = groupRowsByWordCount([row(250, "first"), row(250, "second"), row(250, "third")]);
    expect(groups).toHaveLength(1);
    expect(groups[0].rows.map((r) => r.id)).toEqual(["first", "second", "third"]);
  });

  it("returns nothing for no rows", () => {
    expect(groupRowsByWordCount([])).toEqual([]);
  });

  it("handles a single unlimited prompt without inventing a numbered group", () => {
    expect(groupRowsByWordCount([row(null)]).map((g) => g.label)).toEqual(["Other / no word limit"]);
  });
});
