import { describe, expect, it } from "vitest";

import { PROMPT_FUNCTIONS, inferPromptFunction } from "./prompt-function";
import { categoryReview } from "./retrieval/category-review";
import { listCoveredSchoolNames, lookupSchoolSource } from "./retrieval/registry";

describe("inferring a prompt's function from its text", () => {
  it("returns nothing when there is nothing to read", () => {
    // Unknown scores neutral in matching. Inventing a function for an empty
    // field would assert a fact about an essay nobody has recorded.
    expect(inferPromptFunction("", "")).toBeNull();
    expect(inferPromptFunction("", "short")).toBeNull();
  });

  it("never invents a value outside the reviewed vocabulary", () => {
    const allowed = new Set<string>(PROMPT_FUNCTIONS);
    for (const school of listCoveredSchoolNames()) {
      for (const prompt of lookupSchoolSource(school)?.prompts ?? []) {
        const guess = inferPromptFunction(prompt.title, prompt.promptText);
        if (guess !== null) expect(allowed, `${school} / ${prompt.title}`).toContain(guess);
      }
    }
  });

  it("recognises the requests it is meant to recognise", () => {
    expect(inferPromptFunction("Why Duke", "Why do you want to attend Duke University?")).toBe("connect-to-school");
    expect(inferPromptFunction("", "What would you bring to our campus community?")).toBe("discuss-future-contribution");
    expect(inferPromptFunction("", "What are your career goals after graduating?")).toBe("state-a-future-goal");
    expect(inferPromptFunction("", "Describe your motivations for studying public policy.")).toBe("explain-motivation");
    expect(inferPromptFunction("", "What have you done to make your school a better place?")).toBe("explain-impact");
    expect(inferPromptFunction("", "Describe a challenge and what did you learn from it?")).toBe("demonstrate-growth");
    expect(inferPromptFunction("", "Reflect on an element of your personal experience.")).toBe("reflect");
  });

  it("cannot return `describe`, deliberately", () => {
    // It is the largest true class and the most loosely worded, so patterns
    // broad enough to catch it swallow the others: measured against the review,
    // including it scored 66.9% precision and excluding it 76.7%. A prompt it
    // would have claimed becomes "unknown", which scores neutral - a safe answer
    // instead of a confident wrong one.
    const guesses = new Set<string | null>();
    for (const school of listCoveredSchoolNames()) {
      for (const prompt of lookupSchoolSource(school)?.prompts ?? []) {
        guesses.add(inferPromptFunction(prompt.title, prompt.promptText));
      }
    }
    expect(guesses).not.toContain("describe");
  });

  // The number to remember before relying on this. It is the third and fourth
  // tiers of the precedence chain precisely because a reviewed function - a
  // person having read the prompt - is better than 77%.
  it("holds its measured precision against the reviewed catalogue", () => {
    let committed = 0;
    let agreed = 0;
    let reviewed = 0;
    for (const school of listCoveredSchoolNames()) {
      for (const prompt of lookupSchoolSource(school)?.prompts ?? []) {
        // Precision can only be measured where a person recorded an answer, so
        // the unreviewed part of the 2026-27 catalogue is out of scope here -
        // there is nothing to be right or wrong against.
        const review = categoryReview(school, prompt.externalRef);
        if (!review) continue;
        reviewed += 1;
        const guess = inferPromptFunction(prompt.title, prompt.promptText);
        if (guess === null) continue;
        committed += 1;
        if (guess === review[5]) agreed += 1;
      }
    }
    const precision = agreed / committed;
    // A floor, not a target: this exists to catch a regression that quietly
    // makes the inferrer worse, not to be tuned upward.
    //
    // Measured 68.8% on 192 committed answers out of 553 reviewed prompts, down
    // from 76.7% on 255. **The rules did not change; the denominator did.** The
    // old figure was measured against 250 prompts written mostly by the same
    // small set of schools, and the classification pass added 303 more -
    // programme-specific letters of intent, portfolio instructions, honours
    // supplements - whose requests these patterns were never built to read. A
    // rule set that scored the same on a corpus twice the size and far more
    // varied would be the surprising result.
    //
    // Where it disagrees is legible and mostly one confusion: 9 of the 60 errors
    // are `state-a-future-goal` for what a reader called `explain-motivation`,
    // and 11 more are `connect-to-school` for a prompt whose central request is
    // contribution or reflection. Both are cases where the prompt names a school
    // or a goal in passing while asking for something else, which is the failure
    // mode the ordered-precedence design already documents.
    //
    // What this number buys also changed. A wrong function used to cost 15 of
    // 100 points *and* risk a band ceiling; now function scores nothing and only
    // caps the band on a cross-group mismatch, so a wrong guess inside a group
    // is free. Precision still matters for the ceiling, and this stays a floor.
    expect(precision).toBeGreaterThan(0.65);
    expect(committed / reviewed).toBeGreaterThan(0.3);
  });
});
