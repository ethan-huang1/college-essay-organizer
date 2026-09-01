/**
 * Keeps the hand review and the catalogue in step after a catalogue rebuild,
 * and hands the owner a worksheet for whatever the rebuild added.
 *
 * Two jobs, both mechanical:
 *
 *  1. Drops review rows whose prompt no longer exists. A row pointing at a
 *     retired externalRef is dead weight that would keep failing the coverage
 *     test; the owner's judgement for prompts that survived is untouched, and a
 *     reworded prompt keeps its row because build-catalogue.mts carries its ref
 *     and title across.
 *  2. Writes docs/evaluation/new-prompt-review.csv: one row per catalogue
 *     prompt with no review, carrying the keyword classifier's proposal in the
 *     same column vocabulary as source-review.csv, so reviewing it is editing a
 *     spreadsheet rather than transcribing 300 prompts.
 *
 * Until those rows are reviewed the import stores the classifier's answer, at
 * the classifier's own confidence - which is exactly what the second tier in
 * college-import.ts is for, and what the needs-review surface reads.
 *
 *   node --experimental-strip-types --import ./scripts/ts-resolve.mjs \
 *     scripts/sync-category-review.mts
 */
import { readFileSync, writeFileSync } from "node:fs";

import { classifyUnreviewedPrompt } from "../src/lib/classification.ts";
import { CATEGORY_REVIEW, categoryReview } from "../src/lib/retrieval/category-review.ts";
import { listCoveredSchoolNames, lookupSchoolSource } from "../src/lib/retrieval/registry.ts";

const REVIEW_FILE = "src/lib/retrieval/category-review.ts";
const WORKSHEET = "docs/evaluation/new-prompt-review.csv";

const catalogue = listCoveredSchoolNames().flatMap((schoolName) =>
  (lookupSchoolSource(schoolName)?.prompts ?? []).map((prompt) => ({ schoolName, prompt })));
const live = new Set(catalogue.map(({ schoolName, prompt }) => `${schoolName}|${prompt.externalRef}`));

// 1. Prune dead rows.
const kept = CATEGORY_REVIEW.filter(([school, ref]) => live.has(`${school}|${ref}`));
const dropped = CATEGORY_REVIEW.filter(([school, ref]) => !live.has(`${school}|${ref}`));

const q = (value: string) => JSON.stringify(value);
const body = kept
  .map((row) => `  [${q(row[0])}, ${q(row[1])}, ${q(row[2])}, [${row[3].map(q).join(", ")}], [${row[4].map(q).join(", ")}], ${q(row[5])}],`)
  .join("\n");
const existing = readFileSync(REVIEW_FILE, "utf8");
const start = existing.indexOf("export const CATEGORY_REVIEW");
const end = existing.indexOf("];\n", start) + 3;
writeFileSync(REVIEW_FILE, `${existing.slice(0, start)}export const CATEGORY_REVIEW: CategoryReviewRow[] = [\n${body}\n];\n${existing.slice(end)}`);

// 2. Worksheet for the unreviewed.
const SLUG_TO_PRIMARY: Record<string, string> = {
  community: "Community", diversity: "Background & Identity", "why-us": "Why Us", "why-major": "Why Major",
  "challenge-growth": "Challenge & Growth", "activities-impact": "Activities & Impact",
  "personal-statement": "Personal Statement", shorts: "Short Answer", other: "Other",
  "reading-list": "Reading List", roommate: "Roommate",
};
const TAG_TO_SECONDARY: Record<string, string> = {
  "academic context": "Academic Context", collaboration: "Collaboration", contribution: "Contribution",
  course: "Course", creativity: "Creativity", disagreement: "Disagreement", "goals & future": "Goals & Future",
  "intellectual curiosity": "Intellectual Curiosity", leadership: "Leadership", service: "Service",
  "values & meaning": "Values",
};

const unreviewed = catalogue.filter(({ schoolName, prompt }) => !categoryReview(schoolName, prompt.externalRef));
const header = [
  "ID", "School", "External ref", "Prompt title", "Proposed primary", "Secondary 1", "Secondary 2", "Secondary 3",
  "Your primary override", "Your secondary 1", "Your secondary 2", "Your secondary 3", "Prompt function",
  "Classifier confidence", "Full written prompt", "Word limit", "Requirement", "Scope",
];
const cell = (value: string | number | null | undefined) => {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
const rows = unreviewed.map(({ schoolName, prompt }, index) => {
  const result = classifyUnreviewedPrompt(`${prompt.title} ${prompt.promptText}`);
  const secondaries = result.secondarySlugs.map((slug) => SLUG_TO_PRIMARY[slug] ?? slug);
  const tags = result.tags.map((tag) => TAG_TO_SECONDARY[tag] ?? tag);
  const proposed = [...secondaries, ...tags].slice(0, 3);
  const limit = prompt.maxWordCount ? `${prompt.maxWordCount}w`
    : prompt.maxCharCount ? `${prompt.maxCharCount}c`
    : prompt.note ?? "";
  return [
    index + 1, schoolName, prompt.externalRef, prompt.title,
    result.primarySlug ? SLUG_TO_PRIMARY[result.primarySlug] ?? result.primarySlug : "",
    proposed[0] ?? "", proposed[1] ?? "", proposed[2] ?? "",
    "", "", "", "",
    "", result.confidence, prompt.promptText, limit, prompt.requirement,
    prompt.programLabel ?? prompt.groupKey ?? "",
  ].map(cell).join(",");
});
writeFileSync(WORKSHEET, `${[header.join(","), ...rows].join("\n")}\n`);

console.log(`Review rows kept: ${kept.length}, dropped as stale: ${dropped.length}`);
for (const [school, ref] of dropped) console.log(`  dropped  ${school} / ${ref}`);
console.log(`Unreviewed catalogue prompts written to ${WORKSHEET}: ${unreviewed.length}`);
const unclassified = unreviewed.filter(({ prompt }) => !classifyUnreviewedPrompt(`${prompt.title} ${prompt.promptText}`).primarySlug).length;
console.log(`  of those, the classifier had no signal for ${unclassified} (they import as Other at confidence 0).`);
