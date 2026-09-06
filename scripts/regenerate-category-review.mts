/**
 * Regenerates src/lib/retrieval/category-review.ts from
 * docs/evaluation/prompt-review.csv.
 *
 * The worksheet is the source of truth and this is the only thing that writes
 * the generated module, so a classification is changed by editing the
 * spreadsheet and re-running this - never by hand-editing the module.
 *
 * Three things changed when the worksheet was unified, and each removed a way
 * for the pipeline to lie:
 *
 * 1. **It reads one file.** `source-review.csv` covered 207 prompts and
 *    `new-prompt-review.csv` the other 303, in a different column vocabulary,
 *    with a precedence rule between them. Now there is one file and no
 *    precedence.
 *
 * 2. **Secondaries are uncapped.** Both old files had exactly three secondary
 *    slots, which is an arbitrary limit on a field whose entire purpose is
 *    capturing overlap. One semicolon-separated cell has no ceiling.
 *
 * 3. **The owner's two activities-promotion lists are gone.** They were arrays
 *    of CSV row *indices* living in this script, so the worksheet was not
 *    actually the whole truth and renumbering a row would have silently
 *    reassigned someone else's category. Their effect is baked into the
 *    worksheet's `Final *` columns instead.
 *
 * Prompt functions come from the worksheet too. They used to be read back out
 * of the module this script overwrites, which meant the function column could
 * never be corrected through the pipeline - only by editing generated code.
 *
 * One worksheet row fans out to every catalogue record sharing its prompt text,
 * so the eight UC Personal Insight Questions are one decision applied to seven
 * campuses rather than 56 rows to keep consistent by hand.
 *
 *   node --experimental-strip-types --import ./scripts/ts-resolve.mjs \
 *     scripts/regenerate-category-review.mts
 */
import { readFileSync, writeFileSync } from "node:fs";

import { listCoveredSchoolNames, lookupSchoolSource } from "../src/lib/retrieval/registry.ts";
import { parseCsv } from "./parse-csv.mts";
import {
  FUNCTION_NAMES, PRIMARY_TO_SLUG, SECONDARY_FAMILY, SECONDARY_TAG, signatureOf, splitSecondaries,
} from "./review-vocabulary.mts";

const WORKSHEET = "docs/evaluation/prompt-review.csv";
const MODULE = "src/lib/retrieval/category-review.ts";

const rows = parseCsv(readFileSync(WORKSHEET, "utf8"));

// Every catalogue record, grouped by the prompt text a worksheet row decides.
const recordsBySignature = new Map<string, { school: string; ref: string }[]>();
for (const school of listCoveredSchoolNames()) {
  for (const prompt of lookupSchoolSource(school)?.prompts ?? []) {
    const signature = signatureOf(prompt.title, prompt.promptText);
    if (!recordsBySignature.has(signature)) recordsBySignature.set(signature, []);
    recordsBySignature.get(signature)!.push({ school, ref: prompt.externalRef });
  }
}

type Out = { school: string; ref: string; primary: string; families: string[]; tags: string[]; fn: string };
const out: Out[] = [];
const problems: string[] = [];
const claimed = new Set<string>();

for (const row of rows) {
  const id = row.ID || row["External ref"];
  const where = `#${id} ${row.School} / ${row["External ref"]}`;

  const primaryName = row["Final primary"];
  const fn = row["Final function"];
  // Blank means nobody has decided, which is a different failure from deciding
  // wrongly and has to be reported as such rather than defaulting to `other`.
  // Defaulting is how 42% of the catalogue ended up in a category that earns no
  // points, and it looked like data rather than like a gap.
  if (!primaryName) { problems.push(`${where}: no Final primary`); continue; }
  if (!fn) { problems.push(`${where}: no Final function`); continue; }
  if (!FUNCTION_NAMES.includes(fn as (typeof FUNCTION_NAMES)[number])) {
    problems.push(`${where}: unknown function "${fn}"`); continue;
  }

  const primary = PRIMARY_TO_SLUG[primaryName];
  if (!primary) { problems.push(`${where}: unknown primary "${primaryName}"`); continue; }

  const secondaryNames = splitSecondaries(row["Final secondaries"] ?? "");
  const unmapped = secondaryNames.filter((name) => !SECONDARY_FAMILY[name] && !SECONDARY_TAG[name]);
  if (unmapped.length) { problems.push(`${where}: unmapped secondaries ${unmapped.join(", ")}`); continue; }

  const families = [...new Set(secondaryNames.map((name) => SECONDARY_FAMILY[name]).filter(Boolean))];
  const tags = [...new Set(secondaryNames.map((name) => SECONDARY_TAG[name]).filter(Boolean))];
  // A primary is never also its own secondary: matching would count the same
  // fact twice, once as a shared category and again as a shared theme.
  if (families.includes(primary)) { problems.push(`${where}: primary ${primary} repeated in secondaries`); continue; }

  const signature = signatureOf(row["Prompt title"], row["Full written prompt"]);
  const targets = recordsBySignature.get(signature);
  if (!targets) { problems.push(`${where}: no catalogue record matches this prompt text`); continue; }

  for (const target of targets) {
    const key = `${target.school}|${target.ref}`;
    if (claimed.has(key)) { problems.push(`${where}: ${key} already decided by an earlier row`); continue; }
    claimed.add(key);
    out.push({ school: target.school, ref: target.ref, primary, families, tags, fn });
  }
}

const catalogueSize = [...recordsBySignature.values()].reduce((sum, group) => sum + group.length, 0);
const uncovered = catalogueSize - claimed.size;

if (problems.length > 0) {
  console.error(`Refusing to write ${MODULE}. ${problems.length} problem(s):\n`);
  for (const problem of problems.slice(0, 40)) console.error(`  ${problem}`);
  if (problems.length > 40) console.error(`  ... and ${problems.length - 40} more`);
  console.error(`\n${uncovered} of ${catalogueSize} catalogue records would have been left unclassified.`);
  console.error(`Fill the Final columns in ${WORKSHEET} and re-run.`);
  process.exit(1);
}
if (uncovered !== 0) {
  console.error(`Refusing to write ${MODULE}: ${uncovered} catalogue records are not covered by any worksheet row.`);
  console.error(`Re-run scripts/build-prompt-review.mts to add rows for them.`);
  process.exit(1);
}

out.sort((a, b) => a.school.localeCompare(b.school) || a.ref.localeCompare(b.ref));
const q = (value: string) => JSON.stringify(value);
const body = out.map((r) =>
  `  [${q(r.school)}, ${q(r.ref)}, ${q(r.primary)}, [${r.families.map(q).join(", ")}], [${r.tags.map(q).join(", ")}], ${q(r.fn)}],`
).join("\n");

const existing = readFileSync(MODULE, "utf8");
const header = existing.slice(0, existing.indexOf("export const CATEGORY_REVIEW"));
const tail = existing.slice(existing.indexOf("];\n", existing.indexOf("export const CATEGORY_REVIEW")) + 3);
writeFileSync(MODULE, `${header}export const CATEGORY_REVIEW: CategoryReviewRow[] = [\n${body}\n];\n${tail}`);

console.log(`Wrote ${out.length} rows from ${rows.length} worksheet rows.`);
const counts = new Map<string, number>();
for (const r of out) counts.set(r.primary, (counts.get(r.primary) ?? 0) + 1);
console.log("\nCatalogue records per primary:");
for (const [slug, n] of [...counts].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)}  ${slug}`);
const secondaryHistogram = new Map<number, number>();
for (const r of out) {
  const n = r.families.length + r.tags.length;
  secondaryHistogram.set(n, (secondaryHistogram.get(n) ?? 0) + 1);
}
console.log("\nSecondaries per record:");
for (const [n, count] of [...secondaryHistogram].sort((a, b) => a[0] - b[0])) console.log(`  ${n}: ${count}`);
