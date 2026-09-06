/**
 * One question about the scoring, answered from the catalogue rather than taste:
 * is function adjacency real? Do the eight prompt functions fall into groups
 * that the corpus agrees with, and can a finer adjacency than the two-group
 * split be read off the data?
 *
 * **The answer is no**, and that is why this file is now one section rather
 * than three. Mean similarity between prompts of different function classes
 * spans only 0.19-0.27, `describe`/`reflect` sits *below* the median while the
 * cross-group `discuss-future-contribution`/`reflect` sits highest of all 28
 * pairs. The embedding cannot separate what a prompt asks you to *do* from what
 * it is *about*, so a per-pair adjacency table derived from it would be
 * laundering noise. The two-group split stands, and the graded credit for a
 * within-group difference is set by the calibration sweep instead
 * (scripts/sweep-scoring.mts).
 *
 * The two sections this file used to carry are gone with the factors they
 * measured: the secondary factor and the all-or-nothing function factor were
 * both replaced by the category ladder and its graded function term.
 *
 * Writes docs/evaluation/factor-analysis.md.
 *
 *   node --experimental-strip-types --import ./scripts/ts-resolve.mjs scripts/analyse-factors.mts
 */
import { writeFileSync } from "node:fs";

import { cosine, decodeVector } from "../src/lib/embedding.ts";
import { calibrate } from "../src/lib/embedding.ts";
import { SCORING } from "../src/lib/matching.ts";
import { PROMPT_FUNCTIONS, categoryReview } from "../src/lib/retrieval/category-review.ts";
import { PROMPT_VECTORS } from "../src/lib/retrieval/prompt-vectors.ts";
import { listCoveredSchoolNames, lookupSchoolSource } from "../src/lib/retrieval/registry.ts";
import { classifyUnreviewedPrompt } from "../src/lib/classification.ts";
import { inferPromptFunction } from "../src/lib/prompt-function.ts";

const vectorByKey = new Map(PROMPT_VECTORS.map(([s, r, e]) => [`${s}|${r}`, decodeVector(e)]));
// `key`, not `ref`: nine externalRefs are shared across schools (the eight UC
// Personal Insight Questions across seven campuses, plus `academic-interest` at
// two), so a map keyed on ref merges 58 records into 9.
type P = { school: string; ref: string; key: string; title: string; text: string; primary: string; families: string[]; tags: string[]; fn: string | null; min: number | null; max: number | null; vector?: number[] };
const records: P[] = [];
for (const school of listCoveredSchoolNames()) {
  for (const p of lookupSchoolSource(school)?.prompts ?? []) {
    if (p.supportingMaterial) continue;
    // Reviewed rows win; the rest fall through to the keyword classifier and
    // the function inference, exactly as college-import.ts does. 303 of 553
    // records have no review yet, and a non-null assertion here used to crash
    // on the first of them.
    const r = categoryReview(school, p.externalRef);
    const guess = r ? null : classifyUnreviewedPrompt(`${p.title} ${p.promptText}`);
    records.push({
      school, ref: p.externalRef, key: `${school}|${p.externalRef}`, title: p.title, text: p.promptText,
      primary: r ? r[2] : guess!.primarySlug ?? "other",
      families: r ? r[3] : guess!.secondarySlugs,
      tags: r ? r[4] : guess!.tags,
      fn: r ? r[5] : inferPromptFunction(p.title, p.promptText),
      min: p.minWordCount ?? null, max: p.maxWordCount ?? null,
      vector: vectorByKey.get(`${school}|${p.externalRef}`),
    });
  }
}

// Statistics run on unique prompt texts, not on records: 11 texts appear on
// more than one record (62 records for 11 questions), and left in they weight
// every distribution toward whatever the UCs happen to ask.
const uniqueByText = new Map<string, P>();
for (const record of records) {
  const signature = `${record.title}||${record.text}`.toLowerCase().replace(/\s+/g, " ").trim();
  if (!uniqueByText.has(signature)) uniqueByText.set(signature, record);
}
const prompts: P[] = [...uniqueByText.values()];

const withVectors = prompts.filter((p) => p.vector);
const zBy = new Map<string, Map<string, number>>();
for (const p of withVectors) {
  const cal = calibrate(withVectors.map((t) => cosine(p.vector!, t.vector!)));
  zBy.set(p.key, new Map(withVectors.map((t, i) => [t.key, cal[i]])));
}

const out: string[] = [];
const w = (line = "") => out.push(line);

// ---------------------------------------------------------------------------
w("## 2. What the function factor does today");
w();
w("All-or-nothing on the points, plus a band ceiling on a cross-group mismatch:");
w();
w("```");
w("both known and equal        → 20 points");
w("either unknown              → 10 points (neutral), no ceiling");
w("known, same group           → 0 points,  no ceiling      (\"minor\")");
w("known, different group      → 0 points,  ceiling reusable-edits   (\"major\")");
w("```");
w();
w("Groups are retrospective (describe, reflect, explain-impact,");
w("demonstrate-growth) and forward (explain-motivation,");
w("discuss-future-contribution, connect-to-school, state-a-future-goal).");
w();
w("### Is that two-group split what the prompts actually look like?");
w();
w("Mean similarity between prompts of each function pair. If the two groups are");
w("real, within-group cells should be systematically higher than across-group ones.");
w();
const fns = [...PROMPT_FUNCTIONS];
const meanBetween = (a: string, b: string) => {
  const left = withVectors.filter((p) => p.fn === a);
  const right = withVectors.filter((p) => p.fn === b);
  let sum = 0, n = 0;
  for (const l of left) for (const r of right) {
    if (l.key === r.key || l.title === r.title) continue;
    sum += cosine(l.vector!, r.vector!); n += 1;
  }
  return n ? sum / n : 0;
};
w(`| | ${fns.map((f) => f.slice(0, 9)).join(" | ")} |`);
w(`|---|${fns.map(() => "---").join("|")}|`);
const matrix = new Map<string, number>();
for (const a of fns) {
  const cells = fns.map((b) => {
    const value = meanBetween(a, b);
    matrix.set(`${a}|${b}`, value);
    return value.toFixed(3);
  });
  w(`| **${a}** | ${cells.join(" | ")} |`);
}
w();
const group = SCORING.FUNCTION_GROUPS;
let within = 0, withinN = 0, across = 0, acrossN = 0;
for (const a of fns) for (const b of fns) {
  if (a === b) continue;
  const value = matrix.get(`${a}|${b}`)!;
  if (group[a] === group[b]) { within += value; withinN += 1; } else { across += value; acrossN += 1; }
}
w(`Mean across distinct function pairs: **${(within / withinN).toFixed(3)}** within the same group,`);
w(`**${(across / acrossN).toFixed(3)}** across groups — a ratio of ${((within / withinN) / (across / acrossN)).toFixed(2)}×.`);
w();
w("Every distinct pair ranked by similarity, so adjacency is read off the corpus");
w("rather than asserted:");
w();
w("| Function A | Function B | Mean similarity | Same group today? |");
w("|---|---|---|---|");
const pairs = fns.flatMap((a) => fns.filter((b) => b > a).map((b) => ({ a, b, v: matrix.get(`${a}|${b}`)! })));
for (const pair of pairs.sort((x, y) => y.v - x.v)) {
  w(`| ${pair.a} | ${pair.b} | ${pair.v.toFixed(3)} | ${group[pair.a] === group[pair.b] ? "yes" : "no"} |`);
}
w();

// ---------------------------------------------------------------------------

writeFileSync("docs/evaluation/factor-analysis.md", `${out.join("\n")}\n`);
console.log("Wrote docs/evaluation/factor-analysis.md");
