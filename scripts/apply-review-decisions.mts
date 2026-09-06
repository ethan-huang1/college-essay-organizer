/**
 * Merges classification decisions into docs/evaluation/prompt-review.csv.
 *
 * Reads a TSV of `ID <tab> primary <tab> secondaries <tab> function <tab> why`
 * on stdin or from a file and writes the `Final *` columns for those rows. Every
 * value is validated against the review vocabulary before anything is written,
 * so a typo in a category name fails the batch rather than silently landing a
 * category the app has never heard of - which is how the tag vocabulary once
 * ended up with two sides that could never intersect.
 *
 * Secondaries are semicolon-separated and uncapped. `-` means none.
 *
 *   node --experimental-strip-types --import ./scripts/ts-resolve.mjs \
 *     scripts/apply-review-decisions.mts decisions.tsv
 */
import { readFileSync, writeFileSync } from "node:fs";

import { parseCsv } from "./parse-csv.mts";
import {
  COLUMNS, FUNCTION_NAMES, PRIMARY_TO_SLUG, SECONDARY_FAMILY, SECONDARY_TAG,
  joinSecondaries, splitSecondaries,
} from "./review-vocabulary.mts";

const WORKSHEET = "docs/evaluation/prompt-review.csv";
const source = process.argv[2];
if (!source) { console.error("usage: apply-review-decisions.mts <decisions.tsv>"); process.exit(2); }

const rows = parseCsv(readFileSync(WORKSHEET, "utf8"));
const byId = new Map(rows.map((row) => [row.ID, row]));

const problems: string[] = [];
let applied = 0;

for (const line of readFileSync(source, "utf8").split("\n")) {
  if (!line.trim() || line.startsWith("#")) continue;
  const [id, primary, secondaries, fn, ...whyParts] = line.split("\t");
  const why = whyParts.join("\t").trim();
  const row = byId.get(id?.trim());
  if (!row) { problems.push(`no worksheet row with ID ${id}`); continue; }

  const primaryName = primary?.trim();
  if (!PRIMARY_TO_SLUG[primaryName]) { problems.push(`#${id}: unknown primary "${primaryName}"`); continue; }

  const raw = (secondaries ?? "").trim();
  const names = raw === "-" || raw === "" ? [] : splitSecondaries(raw);
  const unknown = names.filter((name) => !SECONDARY_FAMILY[name] && !SECONDARY_TAG[name]);
  if (unknown.length) { problems.push(`#${id}: unknown secondaries ${unknown.join(", ")}`); continue; }
  // A primary is never also its own secondary: matching would count the same
  // fact twice, once as a shared category and again as a shared theme.
  if (names.some((name) => SECONDARY_FAMILY[name] === PRIMARY_TO_SLUG[primaryName])) {
    problems.push(`#${id}: ${primaryName} repeated as its own secondary`); continue;
  }
  const duplicated = names.filter((name, index) => names.indexOf(name) !== index);
  if (duplicated.length) { problems.push(`#${id}: secondary listed twice: ${duplicated.join(", ")}`); continue; }

  const fnName = fn?.trim();
  if (!FUNCTION_NAMES.includes(fnName as (typeof FUNCTION_NAMES)[number])) {
    problems.push(`#${id}: unknown function "${fnName}"`); continue;
  }
  if (!why) { problems.push(`#${id}: no reason given`); continue; }

  row["Final primary"] = primaryName;
  row["Final secondaries"] = joinSecondaries(names);
  row["Final function"] = fnName;
  row.Why = why;
  applied += 1;
}

if (problems.length > 0) {
  console.error(`Refusing to write. ${problems.length} problem(s):`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

const cell = (value: string) => (/[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value);
const csv = [
  COLUMNS.join(","),
  ...rows.map((row) => COLUMNS.map((column) => cell(row[column] ?? "")).join(",")),
].join("\n");
writeFileSync(WORKSHEET, `${csv}\n`);

const pending = rows.filter((row) => !row["Final primary"] || !row["Final function"]).length;
console.log(`Applied ${applied} decisions. ${pending} of ${rows.length} rows still awaiting classification.`);
