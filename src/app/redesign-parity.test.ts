import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { essayMatchesFilters, promptMatchesFilters, type Filters } from "./filtering";

/**
 * What the UI/UX redesign must not have changed.
 *
 * The database layer is covered in depth by src/lib/db/persistence.test.ts -
 * schools, prompts, essays, versions, assignment, workspace scoping and the
 * canonical shared-prompt invariant all have tests there, and the redesign did
 * not touch src/lib. This file covers the two things that live in the view and
 * that a presentational change really can break silently:
 *
 * 1. the filter predicates, since "same result set for the same query" is a
 *    guarantee the redesign makes about a control it moved and restyled;
 * 2. the form field names, since every Server Action reads its inputs by name -
 *    rename one in the markup and the action receives null with no type error
 *    and no failing test anywhere else.
 */

const VIEW = "src/app/(app)/[section]/page.tsx";
const PROMPT_UI = "src/app/prompt-ui.tsx";
const OVERVIEW = "src/app/(app)/page.tsx";
const AUTH = "src/app/auth-form.tsx";
const markup = [VIEW, PROMPT_UI, OVERVIEW, AUTH]
  .map((path) => readFileSync(path, "utf8"))
  .join("\n");

const NONE: Filters = { school: "", family: "", status: "", q: "", edit: "", remove: "" };
const filters = (partial: Partial<Filters>): Filters => ({ ...NONE, ...partial });

type PromptShape = Parameters<typeof promptMatchesFilters>[0];
type EssayShape = Parameters<typeof essayMatchesFilters>[0];

function prompt(overrides: Partial<PromptShape> = {}): PromptShape {
  return {
    id: "p1",
    schoolId: "s1",
    title: "Community contribution",
    promptText: "Tell us how you would contribute to our community.",
    status: "not-started",
    primaryFamily: { id: "f-community", name: "Community", color: "#2f6440", slug: "community" },
    secondaryFamilies: [],
    assignedEssay: null,
    ...overrides,
  } as PromptShape;
}

function essay(overrides: Partial<EssayShape> = {}): EssayShape {
  return {
    id: "e1",
    title: "The Metronome",
    currentContent: "My grandmother's metronome sat on the piano.",
    status: "draft",
    primaryFamily: { id: "f-personal", name: "Personal Statement", color: "#7a322d", slug: "personal-statement" },
    secondaryFamilies: [],
    ...overrides,
  } as EssayShape;
}

const SCHOOLS = new Map([["s1", "Brown University"], ["s2", "Yale University"]]);

describe("prompt filtering is unchanged", () => {
  it("an empty filter constrains nothing", () => {
    // The bug this guards: treating "" as "match the empty string" would hide
    // every prompt the moment the page loaded.
    expect(promptMatchesFilters(prompt(), NONE, SCHOOLS)).toBe(true);
  });

  it("filters by school on id, not name", () => {
    expect(promptMatchesFilters(prompt(), filters({ school: "s1" }), SCHOOLS)).toBe(true);
    expect(promptMatchesFilters(prompt(), filters({ school: "s2" }), SCHOOLS)).toBe(false);
  });

  it("matches a category as either primary or secondary", () => {
    const withSecondary = prompt({
      secondaryFamilies: [{ id: "f-diversity", name: "Identity & Background", color: "#1f4e5f", slug: "diversity" }],
    } as Partial<PromptShape>);
    expect(promptMatchesFilters(withSecondary, filters({ family: "f-community" }), SCHOOLS)).toBe(true);
    expect(promptMatchesFilters(withSecondary, filters({ family: "f-diversity" }), SCHOOLS)).toBe(true);
    expect(promptMatchesFilters(withSecondary, filters({ family: "f-roommate" }), SCHOOLS)).toBe(false);
  });

  it("filters by derived work state rather than the raw status column", () => {
    expect(promptMatchesFilters(prompt(), filters({ status: "not-started" }), SCHOOLS)).toBe(true);
    expect(promptMatchesFilters(prompt(), filters({ status: "complete" }), SCHOOLS)).toBe(false);
  });

  it("searches title, full prompt text, and school name, case-insensitively", () => {
    expect(promptMatchesFilters(prompt(), filters({ q: "COMMUNITY" }), SCHOOLS)).toBe(true);
    expect(promptMatchesFilters(prompt(), filters({ q: "would contribute" }), SCHOOLS)).toBe(true);
    // The school's name is in the haystack even though the prompt never says it.
    expect(promptMatchesFilters(prompt(), filters({ q: "brown" }), SCHOOLS)).toBe(true);
    expect(promptMatchesFilters(prompt(), filters({ q: "yale" }), SCHOOLS)).toBe(false);
  });

  it("ignores surrounding whitespace in a search", () => {
    expect(promptMatchesFilters(prompt(), filters({ q: "   " }), SCHOOLS)).toBe(true);
    expect(promptMatchesFilters(prompt(), filters({ q: "  community  " }), SCHOOLS)).toBe(true);
  });

  it("requires every active filter, not any of them", () => {
    expect(promptMatchesFilters(prompt(), filters({ school: "s1", q: "community" }), SCHOOLS)).toBe(true);
    expect(promptMatchesFilters(prompt(), filters({ school: "s1", q: "roommate" }), SCHOOLS)).toBe(false);
  });

  it("is unaffected by the edit and remove parameters", () => {
    // Those two drive disclosure, not the result set: opening an editor must
    // never change which prompts are listed.
    expect(promptMatchesFilters(prompt(), filters({ edit: "p1", remove: "s1" }), SCHOOLS)).toBe(true);
  });
});

describe("essay filtering is unchanged", () => {
  it("an empty filter constrains nothing", () => {
    expect(essayMatchesFilters(essay(), NONE)).toBe(true);
  });

  it("filters on the essay's own status vocabulary", () => {
    expect(essayMatchesFilters(essay(), filters({ status: "draft" }))).toBe(true);
    expect(essayMatchesFilters(essay(), filters({ status: "ready" }))).toBe(false);
  });

  it("matches a category as either primary or secondary", () => {
    const withSecondary = essay({
      secondaryFamilies: [{ id: "f-community", name: "Community", color: "#2f6440", slug: "community" }],
    } as Partial<EssayShape>);
    expect(essayMatchesFilters(withSecondary, filters({ family: "f-personal" }))).toBe(true);
    expect(essayMatchesFilters(withSecondary, filters({ family: "f-community" }))).toBe(true);
    expect(essayMatchesFilters(withSecondary, filters({ family: "f-other" }))).toBe(false);
  });

  it("searches title and content, not the school name", () => {
    expect(essayMatchesFilters(essay(), filters({ q: "METRONOME" }))).toBe(true);
    expect(essayMatchesFilters(essay(), filters({ q: "grandmother" }))).toBe(true);
    expect(essayMatchesFilters(essay(), filters({ q: "brown" }))).toBe(false);
  });
});

describe("form field names the Server Actions read", () => {
  // Every name here is looked up by string in a Server Action. A rename in the
  // markup is invisible to TypeScript and to every other test in the suite:
  // the action just receives null.
  const FIELDS = [
    "collegeName",
    "schoolId",
    "name",
    "notes",
    "promptId",
    "title",
    "promptText",
    "minWordCount",
    "maxWordCount",
    "minCharCount",
    "maxCharCount",
    "requirement",
    "conditionalNote",
    "status",
    "deadline",
    "primaryFamilyId",
    "programKey",
    "essayId",
    "content",
    "reason",
    "versionId",
    "targetWordCount",
    "designation",
    "schoolSpecificPhrases",
    "originPromptId",
    "originPromptTitle",
    "originPromptText",
    "email",
    "password",
    "next",
  ];

  it.each(FIELDS)('still renders a control named "%s"', (field) => {
    expect(markup).toContain(`name="${field}"`);
  });

  it("keeps the routes the filter and navigation submit to", () => {
    expect(markup).toContain('action="/schools"');
    expect(markup).toContain('action="/essays"');
  });
});

describe("naming is consistent across the interface", () => {
  const view = readFileSync(VIEW, "utf8");
  const layout = readFileSync("src/app/(app)/layout.tsx", "utf8");

  it.each([
    ["Your Prompts", "/schools"],
    ["Categories", "/families"],
    ["My Essays", "/essays"],
    ["Reuse", "/reuse"],
  ])('labels %s consistently in the nav and the page title', (label, route) => {
    expect(layout).toContain(`["${label}", "${route}"`);
    expect(view).toContain(`title: "${label}"`);
  });

  it("has retired the pre-redesign labels everywhere", () => {
    for (const stale of ["All prompts", "My essays", "Essay categories"]) {
      expect(`${view}\n${layout}`).not.toContain(stale);
    }
  });
});
