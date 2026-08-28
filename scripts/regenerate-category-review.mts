/**
 * Regenerates src/lib/retrieval/category-review.ts from the owner's review CSV.
 *
 * Provenance: docs/evaluation/source-review.csv is a byte copy of
 * Essay_Prompt_Category_Review_Claude.csv. Categories come from there, so the
 * committed data is reproducible from a file in the repo rather than from a hand
 * transcription. Prompt functions are not in that file - they were assigned
 * separately - so they are carried across from the existing generated module by
 * (school, externalRef).
 *
 * The CSV's `Your primary override` / `Final primary` columns are read in
 * preference to `Proposed primary` where they are filled, so editing the
 * spreadsheet and re-running this is the way to change a classification.
 *
 *   node --experimental-strip-types --import ./scripts/ts-resolve.mjs \
 *     scripts/regenerate-category-review.mts
 */
import { readFileSync, writeFileSync } from "node:fs";

import { categoryReview } from "../src/lib/retrieval/category-review.ts";
import { listCoveredSchoolNames, lookupSchoolSource } from "../src/lib/retrieval/registry.ts";

const PRIMARY_TO_SLUG: Record<string, string> = {
  "Community": "community", "Background & Identity": "diversity", "Why Us": "why-us",
  "Why Major": "why-major", "Challenge & Growth": "challenge-growth",
  "Activities & Impact": "activities-impact",
  "Personal Statement": "personal-statement", "Short Answer": "shorts",
  "Other": "other", "Reading List": "reading-list", "Roommate": "roommate",
};
/** Secondaries that are themselves categories, stored as non-primary family links. */
const SECONDARY_FAMILY: Record<string, string> = {
  "Background & Identity": "diversity", "Challenge & Growth": "challenge-growth",
  "Community": "community", "Why Major": "why-major", "Why Us": "why-us",
  "Activities & Impact": "activities-impact",
};
/** Secondaries stored as prompt tags. */
const SECONDARY_TAG: Record<string, string> = {
  "Academic Context": "academic context", "Collaboration": "collaboration",
  "Contribution": "contribution", "Course": "course", "Creativity": "creativity",
  "Disagreement": "disagreement", "Goals & Future": "goals & future",
  "Intellectual Curiosity": "intellectual curiosity", "Leadership": "leadership",
  "Service": "service", "Values": "values & meaning",
};

/**
 * Owner decisions applied on top of the CSV.
 *
 * Activities & Impact is a primary only where the prompt centrally requires an
 * activity, role, job, responsibility or project. Impact, contribution, service,
 * talent or making something does not qualify on its own - which is why the
 * second list keeps `Other` and carries Activities & Impact as a secondary.
 */
const PROMOTE_TO_ACTIVITIES: number[] = [32, 35, 66, 79, 80, 86, 179, 202];
const KEEP_OTHER_WITH_ACTIVITIES_SECONDARY: number[] = [4, 7, 27, 33, 39, 44, 129, 159, 182];

type CsvRow = Record<string, string>;
function parseCsv(text: string): CsvRow[] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (ch !== "\r") field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift()!.map((h) => h.replace(/^﻿/, "").trim());
  return rows.filter((r) => r.some((c) => c.trim())).map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? "").trim()])));
}

const csv = parseCsv(readFileSync("docs/evaluation/source-review.csv", "utf8"));
const UC_LABEL = "University of California (systemwide)";
const UC = listCoveredSchoolNames().filter((s) => s.startsWith("University of California,")).sort();

// (school, title) -> externalRef, from the registry.
const refByKey = new Map<string, string>();
const titlesBySchool = new Map<string, string[]>();
for (const school of listCoveredSchoolNames()) {
  const titles: string[] = [];
  for (const prompt of lookupSchoolSource(school)?.prompts ?? []) {
    refByKey.set(`${school}|${prompt.title}`, prompt.externalRef);
    titles.push(prompt.title);
  }
  titlesBySchool.set(school, titles);
}

type Out = { school: string; ref: string; primary: string; families: string[]; tags: string[]; fn: string };
const out: Out[] = [];
const changes: string[] = [];

for (const row of csv) {
  const id = Number(row.ID);
  const rawPrimary = row["Your primary override"] || row["Final primary"] || row["Proposed primary"];
  const rawSecondaries = [1, 2, 3]
    .map((n) => row[`Your secondary ${n}`] || row[`Final secondary ${n}`] || row[`Secondary ${n}`])
    .filter(Boolean);

  let primaryName = rawPrimary;
  let secondaryNames = [...rawSecondaries];

  if (PROMOTE_TO_ACTIVITIES.includes(id)) {
    primaryName = "Activities & Impact";
    // A primary is never repeated among its own secondaries.
    secondaryNames = secondaryNames.filter((s) => s !== "Activities & Impact");
    changes.push(`#${id} ${row["Prompt title"]}: ${rawPrimary} -> Activities & Impact (secondaries kept: ${secondaryNames.join(", ") || "none"})`);
  } else if (KEEP_OTHER_WITH_ACTIVITIES_SECONDARY.includes(id)) {
    if (!secondaryNames.includes("Activities & Impact")) {
      secondaryNames.push("Activities & Impact");
      changes.push(`#${id} ${row["Prompt title"]}: kept ${primaryName}, added Activities & Impact secondary`);
    }
  }

  const primary = PRIMARY_TO_SLUG[primaryName];
  if (!primary) throw new Error(`#${id}: unknown primary "${primaryName}"`);
  const families = secondaryNames.map((s) => SECONDARY_FAMILY[s]).filter(Boolean);
  const tags = secondaryNames.map((s) => SECONDARY_TAG[s]).filter(Boolean);
  const unmapped = secondaryNames.filter((s) => !SECONDARY_FAMILY[s] && !SECONDARY_TAG[s]);
  if (unmapped.length) throw new Error(`#${id}: unmapped secondaries ${unmapped.join(", ")}`);
  if (families.includes(primary)) throw new Error(`#${id}: primary ${primary} duplicated in secondaries`);

  for (const school of row.School === UC_LABEL ? UC : [row.School]) {
    const ref = refByKey.get(`${school}|${row["Prompt title"]}`);
    if (!ref) throw new Error(`#${id}: no catalogue prompt "${row["Prompt title"]}" at ${school}`);
    const fn = categoryReview(school, ref)?.[5];
    if (!fn) throw new Error(`#${id}: no prompt function recorded for ${school} / ${ref}`);
    out.push({ school, ref, primary, families, tags, fn });
  }
}

out.sort((a, b) => a.school.localeCompare(b.school) || a.ref.localeCompare(b.ref));
const q = (v: string) => JSON.stringify(v);
const body = out.map((r) =>
  `  [${q(r.school)}, ${q(r.ref)}, ${q(r.primary)}, [${r.families.map(q).join(", ")}], [${r.tags.map(q).join(", ")}], ${q(r.fn)}],`
).join("\n");

const existing = readFileSync("src/lib/retrieval/category-review.ts", "utf8");
const header = existing.slice(0, existing.indexOf("export const CATEGORY_REVIEW"));
writeFileSync("src/lib/retrieval/category-review.ts",
  `${header}export const CATEGORY_REVIEW: CategoryReviewRow[] = [\n${body}\n];\n${existing.slice(existing.indexOf("];\n", existing.indexOf("export const CATEGORY_REVIEW")) + 3)}`);

console.log(`Wrote ${out.length} rows from ${csv.length} review rows.`);
console.log(`\nChanges applied (${changes.length}):`);
for (const change of changes) console.log(`  ${change}`);
const counts = new Map<string, number>();
for (const r of out) counts.set(r.primary, (counts.get(r.primary) ?? 0) + 1);
console.log("\nCatalogue records per primary:");
for (const [slug, n] of [...counts].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)}  ${slug}`);
