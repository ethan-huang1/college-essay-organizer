import { describe, expect, it } from "vitest";

import { classifyText, mapLegacySlug } from "./classification";
import { PROMPT_FAMILIES, SECONDARY_TAGS } from "./db/taxonomy";

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

  // Three concepts are internal matching signal, never a user-facing category.
  // They must appear as tags and never as a slug. Challenge & Growth used to be
  // in that group and is now a real category - the catalogue review files 23
  // prompts there - so it is asserted the other way round: a category, and
  // deliberately NOT also a tag, because recording it twice would let matching
  // count one shared concept as two pieces of evidence.
  describe("derived concepts as internal tags", () => {
    it("treats challenge & growth as a category, not a tag", () => {
      const result = classifyText("Describe the most significant challenge you have faced and how you overcame it.");
      expect(result.primarySlug).toBe("challenge-growth");
      expect(result.tags).not.toContain("challenge-growth");
      expect(PROMPT_FAMILIES.map(([slug]) => slug as string)).toContain("challenge-growth");
    });

    it("does not let a societal-problem prompt become a personal challenge prompt", () => {
      // The bare word "challenge" used to be enough. Stanford asks what
      // challenge *society* faces and Michigan asks you to "challenge the
      // present"; neither is about the student overcoming anything, and the
      // review files both under Other.
      expect(classifyText("What is the most significant challenge that society faces today?").primarySlug)
        .not.toBe("challenge-growth");
      expect(classifyText("Share how you are prepared to challenge the present and enrich the future.").primarySlug)
        .not.toBe("challenge-growth");
    });

    it("separates a roommate note and a book list from short answers", () => {
      // Both used to match `shorts` on a bare word, which made a 250-word
      // roommate note look interchangeable with a 50-word favourite-song
      // answer. A list of five *things* is still a short answer.
      expect(classifyText("Write a note to your future roommate that reveals something about you.").primarySlug)
        .toBe("roommate");
      expect(classifyText("List five books you have read that have intrigued you.").primarySlug)
        .toBe("reading-list");
      expect(classifyText("List five things that are important to you.").primarySlug).toBe("shorts");
    });

    // Tag names are the seeded display names, not slugs, and that is
    // load-bearing rather than cosmetic. Prompt tags are stored by name; when
    // this emitted slugs, an essay's derived tags and a prompt's reviewed tags
    // could never intersect, so the secondary-overlap factor scored zero for
    // every pair in the workspace and the whole factor was dead weight.
    it("emits seeded tag names so essay and prompt tags share one vocabulary", () => {
      expect(classifyText("Tell us about a research question you fell down a rabbit hole exploring.").tags)
        .toContain("intellectual curiosity");
      // Not a tag any more: Activities & Impact is a primary category, so an
      // activities prompt classifies into it rather than being tagged with it.
      // Recording both would let matching count one concept twice.
      expect(classifyText("Describe your most meaningful extracurricular activity and its impact.").primarySlug)
        .toBe("activities-impact");
      expect(classifyText("Reflect on a time you held an opposing view and changed your mind.").tags)
        .toContain("disagreement");
      expect(classifyText("What principle matters most to you and why?").tags).toContain("values & meaning");
    });

    // The invariant behind the bug, rather than one of its symptoms. Prompt tags
    // are stored as rows in prompt_tags keyed by name; an emitted tag that is
    // not a seeded name resolves to no row, so the link is silently dropped and
    // the secondary-overlap factor loses that signal with nothing failing.
    it("only ever emits tag names that seedTaxonomy actually creates", () => {
      const seeded = new Set<string>(SECONDARY_TAGS);
      const samples = [
        "Describe a challenge you have faced and how you overcame it, and what you learned about your values.",
        "Tell us about a research question, a team project you led, and the course you would design.",
        "How will you contribute to our community through service and creative work after graduating?",
        "Share any special circumstances that impacted your academic record.",
        "Reflect on a disagreement, a collaboration, and what brings you joy.",
      ];
      const emitted = new Set(samples.flatMap((text) => classifyText(text).tags));
      expect(emitted.size).toBeGreaterThan(5);
      for (const tag of emitted) expect(seeded, `"${tag}" is not a seeded tag`).toContain(tag);
    });

    it("covers the review's eleven tag secondaries, not only the original three", () => {
      // An essay earns secondary signal only through these rules, so a tag the
      // rules cannot produce is one the essay side can never match on.
      const samples: [string, string][] = [
        ["How will you contribute to and enrich our community?", "contribution"],
        ["Describe your volunteer service in the community.", "service"],
        ["Tell us about a time you led a team as captain.", "leadership"],
        ["Describe how you express your creative side and design things.", "creativity"],
        ["If you could teach a class, what course would it be?", "course"],
        ["What are your career goals after graduating?", "goals & future"],
        ["Describe a group project where you collaborated with a team.", "collaboration"],
        ["Share any special circumstances that impacted your academic record.", "academic context"],
      ];
      for (const [text, tag] of samples) {
        expect(classifyText(text).tags, text).toContain(tag);
      }
    });
  });

  it("maps every pre-existing slug onto a current category", () => {
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
