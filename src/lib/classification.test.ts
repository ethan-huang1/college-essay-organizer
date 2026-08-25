import { describe, expect, it } from "vitest";

import { classifyText, mapLegacySlug } from "./classification";
import { PROMPT_FAMILIES } from "./db/taxonomy";

describe("deterministic prompt/essay classification", () => {
  it("only ever returns one of the seven categories", () => {
    const slugs = new Set(PROMPT_FAMILIES.map(([slug]) => slug as string));
    const samples = [
      "Why Duke? What draws you to our campus?",
      "Describe a community that shaped you.",
      "What is your intended major and why?",
      "Tell us about your cultural background and family traditions.",
      "What would you want your roommates to know about you?",
      "Describe a time you overcame a significant challenge.",
    ];
    for (const text of samples) {
      const result = classifyText(text);
      if (result.primarySlug) expect(slugs, text).toContain(result.primarySlug);
      for (const secondary of result.secondarySlugs) expect(slugs, text).toContain(secondary);
    }
  });

  // The old keywords were organizer-side phrasing ("why us", "our campus") that
  // no real supplement uses, so zero of 255 catalogue prompts ever classified
  // as a fit prompt. These are the shapes schools actually write.
  describe("Why Us", () => {
    it("recognises the way schools actually ask it", () => {
      for (const text of [
        "Why Duke? What is your impression of Duke as a university and community?",
        "Why are you applying to Georgetown?",
        "Why Davidson",
        "Why Wake?",
        "What aspects of our location are most compelling to you?",
        "Discuss how your interests align with this program at our university.",
        "Why do you want to attend?",
      ]) {
        expect(classifyText(text).primarySlug, text).toBe("why-us");
      }
    });

    // Purpose outranks length. A 50-word "Why Duke?" is a fit prompt that
    // happens to be short, and hit-counting alone got this backwards because
    // length words are common and purpose words are not.
    it("keeps a short fit prompt as Why Us rather than a Short Answer", () => {
      const result = classifyText("Why Duke? In 50 words or fewer.");
      expect(result.primarySlug).toBe("why-us");
    });

    it("does not swallow a plain academic-interest prompt", () => {
      expect(classifyText("What is your intended major, and how did you choose it?").primarySlug).toBe("why-major");
    });

    // Capitalisation is the discriminator: a school name is a proper noun, a
    // field of study is not.
    it("tells a school apart from a field after 'why'", () => {
      expect(classifyText("Why Penn?").primarySlug).toBe("why-us");
      expect(classifyText("Why medicine?").primarySlug).toBe("why-major");
    });
  });

  it("classifies a community prompt as Community rather than a narrative", () => {
    expect(classifyText("What have you done to make your school or your community a better place?").primarySlug)
      .toBe("community");
  });

  it("keeps a null primary for text with no signal at all", () => {
    const result = classifyText("Lorem ipsum dolor sit amet consectetur.");
    expect(result.primarySlug).toBeNull();
    expect(result.secondarySlugs).toEqual([]);
    expect(result.confidence).toBe(0);
  });

  // The four retired categories are internal matching signal now, never a
  // user-facing category. They must appear as tags and never as a slug.
  describe("retired concepts as internal tags", () => {
    it("records the concept as a tag, not a category", () => {
      const result = classifyText("Describe the most significant challenge you have faced and how you overcame it.");
      expect(result.tags).toContain("challenge-growth");
      expect(result.primarySlug).not.toBe("challenge-growth");
      expect(PROMPT_FAMILIES.map(([slug]) => slug as string)).not.toContain("challenge-growth");
    });

    it("tags intellectual curiosity and activities without adding categories", () => {
      expect(classifyText("Tell us about a research question you fell down a rabbit hole exploring.").tags)
        .toContain("intellectual-curiosity");
      expect(classifyText("Describe your most meaningful extracurricular leadership responsibility.").tags)
        .toContain("activities-impact");
      expect(classifyText("Reflect on a time you held an opposing view and changed your mind.").tags)
        .toContain("values-meaning");
    });
  });

  it("maps every pre-seven slug onto one of the seven", () => {
    const slugs = new Set(PROMPT_FAMILIES.map(([slug]) => slug as string));
    for (const legacy of [
      "core-story", "identity-background", "community-contribution", "challenge-growth",
      "intellectual-curiosity", "why-major", "why-school", "activities-impact",
      "values-meaning", "short-takes",
    ]) {
      expect(slugs, legacy).toContain(mapLegacySlug(legacy));
    }
  });

  it("is deterministic: identical input always produces identical output", () => {
    const text = "Describe a community you belong to and how you contributed to it through service and leadership.";
    expect(classifyText(text)).toEqual(classifyText(text));
  });
});
