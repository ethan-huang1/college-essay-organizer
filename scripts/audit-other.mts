/**
 * Dumps every prompt the catalogue review files under `Other`, for the audit in
 * docs/evaluation/other-audit.md.
 *
 * `Other` is 94 of 255 prompts and the least reusable category in the
 * evaluation, so the question is whether it is genuinely a collection of
 * one-offs or whether it hides recurring essay families. That judgement needs
 * the prompts read, not counted - this script only lays them out.
 *
 *   node --experimental-strip-types --import ./scripts/ts-resolve.mjs scripts/audit-other.mts
 */
import { writeFileSync } from "node:fs";

import { categoryReview } from "../src/lib/retrieval/category-review.ts";
import { listCoveredSchoolNames, lookupSchoolSource } from "../src/lib/retrieval/registry.ts";

type Row = { school: string; ref: string; title: string; text: string; fn: string; tags: string[]; families: string[]; limit: string };
const rows: Row[] = [];
for (const school of listCoveredSchoolNames()) {
  for (const prompt of lookupSchoolSource(school)?.prompts ?? []) {
    const reviewed = categoryReview(school, prompt.externalRef);
    if (reviewed?.[2] !== "other") continue;
    rows.push({
      school, ref: prompt.externalRef, title: prompt.title,
      text: prompt.promptText.replace(/\s+/g, " ").trim(),
      families: reviewed[3], tags: reviewed[4], fn: reviewed[5],
      limit: prompt.maxWordCount ? `${prompt.maxWordCount}w` : prompt.maxCharCount ? `${prompt.maxCharCount}ch` : "no limit",
    });
  }
}
rows.sort((a, b) => a.fn.localeCompare(b.fn) || a.school.localeCompare(b.school));

const out: string[] = [];
out.push(`# Every prompt currently classified \`Other\` (${rows.length})`);
out.push("");
out.push("Grouped by prompt function, because a category has to name an essay");
out.push("function rather than a shared topic to be worth having.");
out.push("");
let current = "";
for (const row of rows) {
  if (row.fn !== current) {
    current = row.fn;
    const count = rows.filter((r) => r.fn === current).length;
    out.push(`## function: ${current} (${count})`);
    out.push("");
  }
  const secondaries = [...row.families, ...row.tags].join(", ") || "—";
  out.push(`- **${row.title}** — ${row.school} · ${row.limit} · _${secondaries}_`);
  out.push(`  > ${row.text.slice(0, 300)}${row.text.length > 300 ? "…" : ""}`);
}
writeFileSync("docs/evaluation/other-prompts.md", out.join("\n") + "\n");
console.log(`Wrote docs/evaluation/other-prompts.md (${rows.length} prompts)`);
