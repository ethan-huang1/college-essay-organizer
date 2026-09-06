import { describe, expect, it } from "vitest";

import { diffWords } from "./word-diff";

describe("diffWords", () => {
  it("marks identical text as entirely unchanged", () => {
    const tokens = diffWords("hello world", "hello world");
    expect(tokens.every((token) => token.type === "same")).toBe(true);
  });

  it("marks removed and added words when a middle word changes", () => {
    const tokens = diffWords("the quick fox jumps", "the slow fox jumps");
    expect(tokens.find((token) => token.type === "removed")?.text).toBe("quick");
    expect(tokens.find((token) => token.type === "added")?.text).toBe("slow");
  });

  it("reassembles to the original text when only same/removed tokens are kept", () => {
    const before = "one two three four";
    const after = "one three";
    const tokens = diffWords(before, after);
    const reconstructedBefore = tokens.filter((t) => t.type !== "added").map((t) => t.text).join("");
    const reconstructedAfter = tokens.filter((t) => t.type !== "removed").map((t) => t.text).join("");
    expect(reconstructedBefore).toBe(before);
    expect(reconstructedAfter).toBe(after);
  });
});
