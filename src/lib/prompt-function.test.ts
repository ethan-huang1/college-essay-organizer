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
    expect(precision).toBeGreaterThan(0.7);
    expect(committed / reviewed).toBeGreaterThan(0.3);
  });
});
