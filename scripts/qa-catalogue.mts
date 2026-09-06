/**
 * Deterministic QA over the built catalogue - the same checks the 2026-27
 * master was audited against, re-run on what actually landed in the source
 * records. Exits non-zero on any finding, so it can gate an import.
 *
 *   node --experimental-strip-types --import ./scripts/ts-resolve.mjs \
 *     scripts/qa-catalogue.mts
 */
import { readFileSync } from "node:fs";

import { CURRENT_CYCLE_LABEL } from "../src/lib/cycle.ts";
import { PROMPT_FAMILIES } from "../src/lib/db/taxonomy.ts";
import { CATEGORY_REVIEW, categoryReview } from "../src/lib/retrieval/category-review.ts";
import { normalizeWhitespace, validateRecord } from "../src/lib/retrieval/normalize.ts";
import { PROMPT_VECTORS } from "../src/lib/retrieval/prompt-vectors.ts";
import { listCoveredSchoolNames, lookupSchoolSource } from "../src/lib/retrieval/registry.ts";
import { TOP_UNIVERSITIES } from "../src/lib/top-universities.ts";

const fail: string[] = [];
const note: string[] = [];
const F = (message: string) => fail.push(message);

const schools = listCoveredSchoolNames();
const records = schools.map((name) => ({ name, record: lookupSchoolSource(name)! }));
const catalogue = records.flatMap(({ name, record }) => record.prompts.map((prompt) => ({ school: name, prompt })));

// 1. Exactly 100 unique schools, and they are the picker's 100.
if (schools.length !== 100) F(`expected 100 schools, got ${schools.length}`);
if (new Set(schools).size !== schools.length) F("duplicate school records");
for (const name of TOP_UNIVERSITIES) if (!lookupSchoolSource(name)) F(`${name}: in the picker, absent from the catalogue`);
for (const name of schools) if (!TOP_UNIVERSITIES.includes(name)) F(`${name}: in the catalogue, absent from the picker`);

// 2. No unverified record, and no record whose note still reads as unresolved.
const SCAFFOLD = /(NEEDS_REVIEW|UNRESOLVED|not yet confirmed for the 2026-27|could not be (directly |independently )?(confirmed|fetched|verified)|stale|placeholder|TODO|TBD)/i;
for (const { name, record } of records) {
  if (record.verificationStatus === "needs-review") F(`${name}: needs-review record`);
  if (SCAFFOLD.test(record.note)) F(`${name}: note still reads as unresolved research`);
  for (const prompt of record.prompts) {
    if (prompt.note && SCAFFOLD.test(prompt.note)) F(`${name}/${prompt.externalRef}: prompt note reads as unresolved`);
    if (SCAFFOLD.test(prompt.promptText)) F(`${name}/${prompt.externalRef}: prompt text is a research record, not a prompt`);
  }
}

// 3. Schema, per the pipeline's own validator.
for (const { name, record } of records) {
  for (const error of validateRecord(record)) F(`${name}: ${error}`);
  if (record.cycleLabel !== CURRENT_CYCLE_LABEL) F(`${name}: cycleLabel ${record.cycleLabel}`);
}

// 4. No duplicate prompts: refs unique per school, and no two prompts at one
// school share both text and scope.
for (const { name, record } of records) {
  const refs = record.prompts.map((prompt) => prompt.externalRef);
  if (new Set(refs).size !== refs.length) F(`${name}: duplicate externalRef`);
  const scoped = record.prompts.map((prompt) => `${normalizeWhitespace(prompt.promptText).toLowerCase()}|${prompt.programKey ?? ""}`);
  const seen = new Set<string>();
  for (const key of scoped) {
    if (seen.has(key)) F(`${name}: two prompts share text and scope`);
    seen.add(key);
  }
}

// 5. Complete prompt text, and limits the schema can hold.
//
// Completeness is checked against the master rather than by shape: a prompt can
// legitimately be nine characters ("Why PLME?") or end in an ellipsis (Maryland
// and Colgate both ask in sentence stems), so the only meaningful question is
// whether the text still matches what was researched, byte for byte after
// whitespace collapse.
const masterText = new Map<string, Set<string>>();
for (const school of (JSON.parse(readFileSync("docs/catalogue/master-supplemental-2026-27.json", "utf8")) as {
  schools: { school: string; prompts: { prompt_text: string }[] }[];
}).schools) {
  masterText.set(school.school, new Set(school.prompts.map((prompt) => normalizeWhitespace(prompt.prompt_text))));
}
for (const { school, prompt } of catalogue) {
  const where = `${school}/${prompt.externalRef}`;
  const text = prompt.promptText;
  if (text.trim().length < 8) F(`${where}: prompt text too short to be a prompt`);
  if (!masterText.get(school)?.has(normalizeWhitespace(text))) {
    F(`${where}: prompt text does not match the master verbatim (altered or truncated in transform)`);
  }
  for (const [field, value] of Object.entries({
    minWordCount: prompt.minWordCount, maxWordCount: prompt.maxWordCount,
    minCharCount: prompt.minCharCount, maxCharCount: prompt.maxCharCount,
  })) {
    if (value == null) continue;
    if (!Number.isInteger(value) || value <= 0) F(`${where}: ${field} is ${value}`);
  }
  if (prompt.requirement === "conditional" && !prompt.conditionalNote?.trim()) F(`${where}: conditional with no note`);
  if (!["required", "optional", "conditional"].includes(prompt.requirement)) F(`${where}: requirement ${prompt.requirement}`);
}

// 6. Conditional scope: reserved for program-gated prompts, and choose-N sets
// are groups instead. An unresolved conditional is allowed but counted.
const unresolved = catalogue.filter(({ prompt }) => prompt.requirement === "conditional" && !prompt.programKey);
if (unresolved.length > 5) {
  F(`${unresolved.length} conditional prompts have no programKey (ceiling 5): ${unresolved.map((row) => `${row.school}/${row.prompt.externalRef}`).join(", ")}`);
}
for (const { name, record } of records) {
  for (const group of record.promptGroups ?? []) {
    const members = record.prompts.filter((prompt) => prompt.groupKey === group.key);
    if (members.length < group.requiredCount) F(`${name}: group ${group.key} asks ${group.requiredCount} of ${members.length}`);
    for (const member of members) {
      if (member.requirement === "required") F(`${name}/${member.externalRef}: a choose-N member must not be individually required`);
    }
  }
}

// 7. Classification: every prompt lands in a real category, and the review has
// no stale rows.
const slugs = new Set(PROMPT_FAMILIES.map(([slug]) => slug as string));
for (const [school, ref, primary] of CATEGORY_REVIEW) {
  if (!lookupSchoolSource(school)?.prompts.some((prompt) => prompt.externalRef === ref)) F(`review row ${school}/${ref} points at no prompt`);
  if (!slugs.has(primary)) F(`review row ${school}/${ref}: primary ${primary} is outside the taxonomy`);
}
const reviewed = catalogue.filter(({ school, prompt }) => categoryReview(school, prompt.externalRef)).length;

// 8. One committed embedding per prompt.
const vectorKeys = new Set(PROMPT_VECTORS.map(([school, ref]) => `${school}|${ref}`));
if (PROMPT_VECTORS.length !== catalogue.length) F(`${PROMPT_VECTORS.length} vectors for ${catalogue.length} prompts`);
for (const { school, prompt } of catalogue) {
  if (!vectorKeys.has(`${school}|${prompt.externalRef}`)) F(`${school}/${prompt.externalRef}: no committed vector`);
}

// 9. The owner's worksheet covers exactly the unreviewed prompts.
const worksheet = readFileSync("docs/evaluation/new-prompt-review.csv", "utf8").split("\n").slice(1).filter(Boolean).length;
if (worksheet !== catalogue.length - reviewed) F(`worksheet has ${worksheet} rows for ${catalogue.length - reviewed} unreviewed prompts`);

note.push(`schools: ${schools.length}, prompts: ${catalogue.length}`);
note.push(`reviewed: ${reviewed}, awaiting review: ${catalogue.length - reviewed}`);
note.push(`grouped: ${catalogue.filter(({ prompt }) => prompt.groupKey).length}, program-gated: ${catalogue.filter(({ prompt }) => prompt.programKey).length}, unresolved conditional: ${unresolved.length}`);
note.push(`requirement mix: ${JSON.stringify(catalogue.reduce<Record<string, number>>((acc, { prompt }) => ({ ...acc, [prompt.requirement]: (acc[prompt.requirement] ?? 0) + 1 }), {}))}`);
note.push(`verification: ${JSON.stringify(records.reduce<Record<string, number>>((acc, { record }) => ({ ...acc, [record.verificationStatus]: (acc[record.verificationStatus] ?? 0) + 1 }), {}))}`);

for (const line of note) console.log(line);
console.log(fail.length === 0 ? "\nQA: pass" : `\nQA: ${fail.length} finding(s)`);
for (const problem of fail) console.log(`  X ${problem}`);
process.exit(fail.length === 0 ? 0 : 1);
