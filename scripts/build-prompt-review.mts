/**
 * Builds docs/evaluation/prompt-review.csv: one row per unique prompt, and the
 * single worksheet the classification is edited in.
 *
 * Replaces two files with different schemas. `source-review.csv` held 207
 * unique prompts in 25 columns with three secondary slots; the catalogue
 * rebuild then added 303 prompts and gave them their own `new-prompt-review.csv`
 * in 18 different columns with no `Final *` columns and no function column at
 * all. Two worksheets, two vocabularies and a precedence rule between them is
 * exactly the "two tables contradicting each other" that this repo's own
 * comments warn about, and neither file could express more than three
 * secondaries.
 *
 * **Existing human judgement is preserved by construction.** The reviewed
 * values are read out of `category-review.ts`, which already *is* the finalized
 * review: it is the output of source-review.csv with the owner's two
 * activities-promotion lists applied, keyed by (school, externalRef), and it
 * already carries the prompt functions that source-review.csv never had. So
 * round-tripping through this worksheet reproduces it exactly, which
 * `regenerate-category-review.mts` asserts rather than assumes.
 *
 * Unreviewed prompts get the keyword classifier's proposal in the `Proposed *`
 * columns and empty `Final *` columns. Empty means "nobody has decided yet" and
 * the regenerate script refuses to run until every row is filled.
 *
 * One row per unique prompt text, not per record: the eight UC Personal Insight
 * Questions are one decision each, not seven. `Shared with` names the other
 * records the row's answer will be copied onto, so the fan-out is visible in
 * the worksheet rather than implied by a script.
 *
 * Safe to re-run: it never overwrites a filled `Final *` cell, so running it
 * after editing preserves the edits and only refreshes the read-only columns.
 *
 *   node --experimental-strip-types --import ./scripts/ts-resolve.mjs \
 *     scripts/build-prompt-review.mts
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";


import { classifyUnreviewedPrompt } from "../src/lib/classification.ts";
import { inferPromptFunction } from "../src/lib/prompt-function.ts";
import { categoryReview } from "../src/lib/retrieval/category-review.ts";
import { listCoveredSchoolNames, lookupSchoolSource } from "../src/lib/retrieval/registry.ts";
import { parseCsv } from "./parse-csv.mts";
import { SLUG_TO_PRIMARY, SLUG_TO_SECONDARY, joinSecondaries, signatureOf } from "./review-vocabulary.mts";

const WORKSHEET = "docs/evaluation/prompt-review.csv";
const SEP = " | ";

export const COLUMNS = [
  "ID",
  "School",
  "External ref",
  "Prompt title",
  "Review status",
  "Proposed primary",
  "Proposed secondaries",
  "Proposed function",
  "Final primary",
  "Final secondaries",
  "Final function",
  "Why",
  "Word limit",
  "Requirement",
  "Shared with",
  "Full written prompt",
] as const;

type Record_ = {
  school: string; ref: string; title: string; text: string;
  min: number | null; max: number | null; notes: string | null; requirement: string;
};

const records: Record_[] = [];
for (const school of listCoveredSchoolNames()) {
  for (const prompt of lookupSchoolSource(school)?.prompts ?? []) {
    records.push({
      school, ref: prompt.externalRef, title: prompt.title, text: prompt.promptText,
      min: prompt.minWordCount ?? null, max: prompt.maxWordCount ?? null,
      notes: prompt.note ?? null, requirement: prompt.requirement,
    });
  }
}

// Group by unique text; the first record in registry order is the representative.
const groups = new Map<string, Record_[]>();
for (const record of records) {
  const signature = signatureOf(record.title, record.text);
  if (!groups.has(signature)) groups.set(signature, []);
  groups.get(signature)!.push(record);
}

const limitOf = (record: Record_) => {
  if (record.min !== null && record.max !== null) return `${record.min}-${record.max}w`;
  if (record.max !== null) return `${record.max}w`;
  if (record.min !== null) return `min ${record.min}w`;
  // 41 prompts state a limit the schema has no column for - pages, sentences,
  // "13 words per stem". The note is the limit for those, and blanking it here
  // would tell a reviewer the prompt is unlimited.
  return record.notes ? `(note) ${record.notes}` : "none";
};

// Existing edits win over anything regenerated.
const existingByKey = new Map<string, Record<string, string>>();
if (existsSync(WORKSHEET)) {
  for (const row of parseCsv(readFileSync(WORKSHEET, "utf8"))) {
    existingByKey.set(`${row.School}|${row["External ref"]}`, row);
  }
}

const rows: string[][] = [];
let reviewed = 0;
let pending = 0;
for (const [, members] of groups) {
  const lead = members[0];
  const review = categoryReview(lead.school, lead.ref);
  const previous = existingByKey.get(`${lead.school}|${lead.ref}`);

  let proposedPrimary: string, proposedSecondaries: string[], proposedFunction: string;
  if (review) {
    proposedPrimary = SLUG_TO_PRIMARY[review[2]] ?? review[2];
    proposedSecondaries = [...review[3], ...review[4]].map((slug) => SLUG_TO_SECONDARY[slug] ?? slug);
    proposedFunction = review[5];
  } else {
    const guess = classifyUnreviewedPrompt(`${lead.title} ${lead.text}`);
    proposedPrimary = guess.primarySlug ? SLUG_TO_PRIMARY[guess.primarySlug] ?? guess.primarySlug : "";
    proposedSecondaries = [...guess.secondarySlugs, ...guess.tags].map((slug) => SLUG_TO_SECONDARY[slug] ?? slug);
    proposedFunction = inferPromptFunction(lead.title, lead.text) ?? "";
  }

  // A reviewed prompt is already decided, so its Final columns are prefilled
  // from the review - that is what makes the round-trip lossless. An unreviewed
  // one is left blank, and blank is what the regenerate script rejects.
  const finalPrimary = previous?.["Final primary"] || (review ? proposedPrimary : "");
  const finalSecondaries = previous?.["Final secondaries"] || (review ? joinSecondaries(proposedSecondaries) : "");
  const finalFunction = previous?.["Final function"] || (review ? proposedFunction : "");
  if (finalPrimary && finalFunction) reviewed += 1; else pending += 1;

  const shared = members.slice(1);
  rows.push([
    "",
    lead.school,
    lead.ref,
    lead.title,
    review ? "reviewed" : "new",
    proposedPrimary,
    joinSecondaries(proposedSecondaries),
    proposedFunction,
    finalPrimary,
    finalSecondaries,
    finalFunction,
    previous?.Why || (review ? "carried over from the hand review" : ""),
    limitOf(lead),
    lead.requirement,
    shared.length === 0 ? "" : `${shared.length}: ${shared.map((m) => m.school).join(SEP)}`,
    lead.text,
  ]);
}

rows.sort((a, b) => a[1].localeCompare(b[1]) || a[2].localeCompare(b[2]));
rows.forEach((row, index) => { row[0] = String(index + 1); });

const cell = (value: string) => (/[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value);
const csv = [COLUMNS.join(","), ...rows.map((row) => row.map(cell).join(","))].join("\n");
writeFileSync(WORKSHEET, `${csv}\n`);

console.log(`Wrote ${WORKSHEET}: ${rows.length} unique prompts from ${records.length} records.`);
console.log(`  decided: ${reviewed}`);
console.log(`  awaiting classification: ${pending}`);
