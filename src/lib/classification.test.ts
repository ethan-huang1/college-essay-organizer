import { describe, expect, it } from "vitest";

import { classifyText } from "./classification";

describe("deterministic prompt/essay classification", () => {
  it("classifies a why-major prompt with a plausible secondary family", () => {
    const result = classifyText(
      "Tell us about an idea or experience that makes you genuinely excited about learning. How does it connect to your intended field of study?",
    );
    expect(result.primarySlug).toBe("intellectual-curiosity");
    expect(result.secondarySlugs).toContain("why-major");
    expect(result.confidence).toBeGreaterThan(0);
  });

  it("classifies a why-school prompt distinctly from why-major", () => {
    const result = classifyText("Why this school? Describe the specific programs and resources on our campus that appeal to you.");
    expect(result.primarySlug).toBe("why-school");
  });

  it("returns no primary family and zero confidence for text with no keyword signal", () => {
    const result = classifyText("Lorem ipsum dolor sit amet consectetur.");
    expect(result.primarySlug).toBeNull();
    expect(result.secondarySlugs).toEqual([]);
    expect(result.confidence).toBe(0);
  });

  it("is deterministic: identical input always produces identical output", () => {
    const text = "Describe a community you belong to and how you contributed to it through service and leadership.";
    expect(classifyText(text)).toEqual(classifyText(text));
  });
});
