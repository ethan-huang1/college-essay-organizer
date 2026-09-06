import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { PROMPT_FAMILIES } from "../lib/db/taxonomy";

/**
 * The category pickers are driven from the seeded taxonomy rather than from a
 * hard-coded list, which is what makes a new category appear in the UI at all.
 *
 * Asserted because the alternative failure is silent: a literal list somewhere
 * would leave Activities & Impact selectable in the data and invisible in the
 * form, and nothing else in the suite looks at the form's options.
 */
describe("primary-category UI controls", () => {
  const sources = [
    "src/app/(app)/[section]/page.tsx",
    "src/app/prompt-ui.tsx",
    // The essay metadata and origin-prompt fields are shared by My Essays and
    // the Essay Editor, so they live here now.
    "src/app/essay-ui.tsx",
  ].map((path) => ({ path, text: readFileSync(path, "utf8") }));

  it("builds every category select from snapshot.families", () => {
    for (const { path, text } of sources) {
      const selects = [...text.matchAll(/name="(primaryFamilyId|secondaryFamilyIds)"[\s\S]{0,400}?<\/select>/g)];
      if (selects.length === 0) continue;
      for (const [block] of selects) {
        expect(block, `${path}: a category select must map over snapshot.families`).toContain("snapshot.families.map");
      }
    }
  });

  it("hard-codes no category name in any form", () => {
    // A literal would drift from the taxonomy the moment a category is added or
    // renamed, and the form would keep looking correct.
    for (const { path, text } of sources) {
      for (const [slug, name] of PROMPT_FAMILIES) {
        const literal = `<option value="${slug}"`;
        expect(text, `${path} hard-codes ${name}`).not.toContain(literal);
      }
    }
  });

  it("offers Activities & Impact and Creativity in the right places", () => {
    // Activities & Impact is a primary, so it must reach the primary picker via
    // the taxonomy. Creativity is deliberately secondary-only and must NOT be a
    // primary anywhere.
    const slugs = PROMPT_FAMILIES.map(([slug]) => slug as string);
    expect(slugs).toContain("activities-impact");
    expect(slugs).not.toContain("creativity");
    const names = PROMPT_FAMILIES.map(([, name]) => name as string);
    expect(names).toContain("Activities & Impact");
    expect(names).not.toContain("Creativity");
  });

  it("offers an origin-prompt control on the essay form", () => {
    const essayForm = sources.find(({ path }) => path.includes("essay-ui"))!.text;
    expect(essayForm).toContain('name="originPromptId"');
    expect(essayForm).toContain('name="originPromptText"');
    expect(essayForm).toContain('name="originPromptTitle"');
    // Built from the workspace's own prompts, so it cannot offer a prompt from
    // another workspace.
    expect(essayForm).toContain("snapshot.prompts");
  });
});
