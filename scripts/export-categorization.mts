/**
 * Exports the categorisation actually in use, as a CSV.
 *
 * One row per catalogue prompt (255, so the UC systemwide rows are expanded to
 * their seven campuses). Carries both the review's own vocabulary and the slugs
 * stored against it, so a reader can check the mapping rather than trust it.
 *
 *   node --experimental-strip-types --import ./scripts/ts-resolve.mjs \
 *     scripts/export-categorization.mts
 */
import { writeFileSync } from "node:fs";

import { categoryReview } from "../src/lib/retrieval/category-review.ts";
import { PROMPT_FAMILIES } from "../src/lib/db/taxonomy.ts";
import { listCoveredSchoolNames, lookupSchoolSource } from "../src/lib/retrieval/registry.ts";

// Slug -> the review's display name, so the export reads in the owner's terms.
const REVIEW_NAME: Record<string, string> = {
  community: "Community", diversity: "Background & Identity", "why-us": "Why Us",
  "why-major": "Why Major", "challenge-growth": "Challenge & Growth",
  "personal-statement": "Personal Statement", shorts: "Short Answer",
  other: "Other", "reading-list": "Reading List", roommate: "Roommate",
};
const SECONDARY_NAME: Record<string, string> = {
  "academic context": "Academic Context", "activities & impact": "Activities & Impact",
  diversity: "Background & Identity", "challenge-growth": "Challenge & Growth",
  collaboration: "Collaboration", community: "Community", contribution: "Contribution",
  course: "Course", creativity: "Creativity", disagreement: "Disagreement",
  "goals & future": "Goals & Future", "intellectual curiosity": "Intellectual Curiosity",
  leadership: "Leadership", service: "Service", "values & meaning": "Values",
  "why-major": "Why Major", "why-us": "Why Us",
};
const FUNCTION_NAME: Record<string, string> = {
  describe: "describe", reflect: "reflect", "explain-impact": "explain impact",
  "demonstrate-growth": "demonstrate growth", "explain-motivation": "explain motivation",
  "discuss-future-contribution": "discuss future contribution",
  "connect-to-school": "connect to school", "state-a-future-goal": "state a future goal",
};
const displayName = new Map<string, string>(PROMPT_FAMILIES.map(([slug, name]) => [slug as string, name as string]));

const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
const header = [
  "ID", "School", "Prompt title", "Review primary", "Review secondaries", "Prompt function",
  "Stored primary slug", "Stored secondary families", "Stored secondary tags",
  "Current display name", "Word limit", "External ref",
];
const rows: string[] = [header.map(quote).join(",")];

let id = 0;
for (const school of listCoveredSchoolNames()) {
  for (const prompt of lookupSchoolSource(school)?.prompts ?? []) {
    const reviewed = categoryReview(school, prompt.externalRef);
    if (!reviewed) throw new Error(`unreviewed: ${school} / ${prompt.externalRef}`);
    const [, , primary, families, tags, fn] = reviewed;
    id += 1;
    const limit = prompt.maxWordCount ? `${prompt.maxWordCount}w`
      : prompt.maxCharCount ? `${prompt.maxCharCount}ch`
      : prompt.minWordCount ? `${prompt.minWordCount}w+` : "no limit";
    rows.push([
      String(id), school, prompt.title,
      REVIEW_NAME[primary] ?? primary,
      [...families, ...tags].map((s) => SECONDARY_NAME[s] ?? s).join("; "),
      FUNCTION_NAME[fn] ?? fn,
      primary, families.join("; "), tags.join("; "),
      displayName.get(primary) ?? primary, limit, prompt.externalRef,
    ].map(quote).join(","));
  }
}

writeFileSync("docs/evaluation/categorization.csv", rows.join("\n") + "\n");
console.log(`Wrote docs/evaluation/categorization.csv (${id} prompts)`);
