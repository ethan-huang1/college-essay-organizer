import { describe, expect, it } from "vitest";

import { verifyAndDedupeExcerpts } from "./excerpt-verification";

const ESSAY =
  "I walked into the lab for the first time and felt nervous. " +
  "The lab smelled like burnt coffee and old plastic. " +
  "Over the summer I learned to run the centrifuge on my own. " +
  "In the end, I realized science was less about answers and more about questions.";

describe("verifyAndDedupeExcerpts", () => {
  it("keeps excerpts that are verbatim substrings, in document order", () => {
    const kept = verifyAndDedupeExcerpts(ESSAY, [
      { excerpt: "In the end, I realized science was less about answers" },
      { excerpt: "I walked into the lab for the first time" },
    ]);

    expect(kept.map((entry) => entry.excerpt)).toEqual([
      "I walked into the lab for the first time",
      "In the end, I realized science was less about answers",
    ]);
  });

  it("drops excerpts that are not verbatim substrings", () => {
    const kept = verifyAndDedupeExcerpts(ESSAY, [
      { excerpt: "A sentence the student never wrote." },
      { excerpt: "The lab smelled like burnt coffee and old plastic." },
    ]);

    expect(kept).toHaveLength(1);
    expect(kept[0].excerpt).toBe("The lab smelled like burnt coffee and old plastic.");
  });

  it("keeps only the earliest of two overlapping excerpts", () => {
    const kept = verifyAndDedupeExcerpts(ESSAY, [
      { excerpt: "old plastic. Over the summer I learned to run the centrifuge on my own." },
      { excerpt: "The lab smelled like burnt coffee and old plastic." },
    ]);

    expect(kept).toHaveLength(1);
    expect(kept[0].excerpt).toBe("The lab smelled like burnt coffee and old plastic.");
  });

  it("keeps adjacent but non-overlapping excerpts", () => {
    const kept = verifyAndDedupeExcerpts(ESSAY, [
      { excerpt: "The lab smelled like burnt coffee and old plastic." },
      { excerpt: "Over the summer I learned to run the centrifuge on my own." },
    ]);

    expect(kept).toHaveLength(2);
  });

  it("returns an empty list when nothing verifies", () => {
    expect(verifyAndDedupeExcerpts(ESSAY, [{ excerpt: "nope" }, { excerpt: "also nope" }])).toEqual([]);
  });

  // The point of the type parameter: it filters whatever record shape each
  // coach uses, carrying that coach's own fields through untouched.
  it("preserves each coach's own fields on the records it keeps", () => {
    const shortenShaped = verifyAndDedupeExcerpts(ESSAY, [
      {
        excerpt: "The lab smelled like burnt coffee and old plastic.",
        reason: "Sensory detail.",
        tradeoff: "Minor.",
        shortenPriority: "shorten-first" as const,
      },
    ]);
    const lengthenShaped = verifyAndDedupeExcerpts(ESSAY, [
      {
        excerpt: "Over the summer I learned to run the centrifuge on my own.",
        reason: "Skips what it took to learn.",
        suggestion: "Add what went wrong first.",
        expansionSize: "moderate" as const,
      },
    ]);

    expect(shortenShaped[0]).toMatchObject({ shortenPriority: "shorten-first", tradeoff: "Minor." });
    expect(lengthenShaped[0]).toMatchObject({ expansionSize: "moderate", suggestion: "Add what went wrong first." });
  });
});
