/**
 * Two questions about the scoring, answered from the catalogue rather than taste.
 *
 * 1. Does the secondary factor already give graded partial credit, and what does
 *    it award for 0, 1, 2 and more shared tags?
 * 2. Is function adjacency real? Which function pairs describe prompts that
 *    genuinely resemble each other, and would grading it beat all-or-nothing?
 *
 * Writes docs/evaluation/factor-analysis.md.
 *
 *   node --experimental-strip-types --import ./scripts/ts-resolve.mjs scripts/analyse-factors.mts
 */
import { writeFileSync } from "node:fs";

import { cosine, decodeVector } from "../src/lib/embedding.ts";
import { calibrate } from "../src/lib/embedding.ts";
import { type MatchInput, SCORING, scoreMatch } from "../src/lib/matching.ts";
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
const pct = (n: number, d: number) => `${((n / Math.max(d, 1)) * 100).toFixed(1)}%`;

// ---------------------------------------------------------------------------
w("# Factor analysis: secondary credit and function adjacency");
w();
w("## 1. What the secondary factor awards today");
w();
w("The implementation pools secondary families and tags, intersects the two sides,");
w("and awards 7 points per shared signal capped at 20. It has never required");
w("matching sets, and no single tag can earn the full 20.");
w();
w("```");
w("shared = (essay secondaries ∪ essay tags) ∩ (prompt secondaries ∪ prompt tags)");
w("       + essay primary, if it appears among the prompt's secondaries");
w("       + prompt primary, if it appears among the essay's secondaries");
w("       − anything equal to \"other\", which is never a shared theme");
w();
w("points = min(20, 7 × |shared|)");
w("```");
w();
// Both primaries are `shorts` so they play no part in the secondary factor,
// isolating the tag arithmetic. The primary-crosses-secondary rule gets its own
// row below rather than quietly inflating these.
const demo = (essaySignals: string[], promptSignals: string[], essayPrimary = "shorts", promptPrimary = "shorts") => {
  const input: MatchInput = {
    essayWordCount: 300, essayPrimaryFamilySlug: essayPrimary, essaySecondaryFamilySlugs: [],
    essayTags: essaySignals, essaySchoolSpecificPhrases: [],
    promptSchoolName: "X", promptPrimaryFamilySlug: promptPrimary, promptSecondaryFamilySlugs: [],
    promptTags: promptSignals, promptMinWordCount: 200, promptMaxWordCount: 350,
  };
  const shared = essaySignals.filter((s) => promptSignals.includes(s));
  return { points: scoreMatch(input).factors.secondary, shared };
};
w("| Essay secondaries | Prompt secondaries | Shared | Points |");
w("|---|---|---|---|");
const examples: [string[], string[]][] = [
  [["leadership"], ["service"]],
  [["leadership", "community", "diversity"], ["community", "service"]],
  [["leadership", "community", "diversity"], ["community", "leadership"]],
  [["leadership", "community", "diversity"], ["community", "leadership", "diversity"]],
  [["leadership", "community", "diversity", "creativity"], ["community", "leadership", "diversity", "creativity"]],
  [["contribution"], ["contribution"]],
  [[], ["community", "service"]],
];
for (const [essaySignals, promptSignals] of examples) {
  const { points, shared } = demo(essaySignals, promptSignals);
  w(`| [${essaySignals.join(", ") || "—"}] | [${promptSignals.join(", ") || "—"}] | ${shared.length} (${shared.join(", ") || "none"}) | **${points}** |`);
}
w();
w("And the one case that is not pure tag arithmetic: an essay whose *primary*");
w("subject is one of the prompt's stated sub-themes counts as sharing it, even with");
w("no tags in common. A Community essay against a prompt whose secondaries include");
w("Community is genuinely relevant, and the previous formula recognised this too.");
w();
const cross = demo([], ["community", "service"], "community", "why-major");
w(`| essay primary \`community\`, no tags | [community, service] | 1 (via primary) | **${cross.points}** |`);
w("|---|---|---|---|");
w();
w("The owner's example is row 2: an essay tagged leadership/community/identity");
w("against a prompt tagged community/service earns 7 for the shared `community`,");
w("with no penalty for the tags that differ.");
w();

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
w("## 3. Would grading function beat all-or-nothing?");
w();
w("A graded scheme needs an adjacency judgement. The one tested here is derived");
w("from the matrix above: a pair counts as adjacent if its mean similarity is above");
w("the median of all distinct pairs, and it earns half credit.");
w();
const median = [...pairs].sort((a, b) => a.v - b.v)[Math.floor(pairs.length / 2)].v;
const adjacent = new Set(pairs.filter((p) => p.v > median).map((p) => `${p.a}|${p.b}`));
const isAdjacent = (a: string, b: string) => adjacent.has(`${a}|${b}`) || adjacent.has(`${b}|${a}`);
w(`Median pair similarity is ${median.toFixed(3)}; ${adjacent.size} of ${pairs.length} pairs are above it.`);
w();

/** Scores every distinct prompt pair under a given function rule and weight. */
function sweep(weight: number, graded: boolean, redistribute: "semantic" | "primary" | "none") {
  const bands = { a50: 0, a60: 0, a70: 0, total: 0, cross: 0 };
  const semanticWeight = SCORING.WEIGHTS.normal.semantic + (redistribute === "semantic" ? 20 - weight : 0);
  const primaryWeight = SCORING.WEIGHTS.normal.primary + (redistribute === "primary" ? 20 - weight : 0);
  for (const essay of withVectors) {
    for (const prompt of withVectors) {
      if (essay.key === prompt.key || essay.title === prompt.title) continue;
      bands.total += 1;
      const z = zBy.get(essay.key)!.get(prompt.key)!;
      const semantic = Math.max(0, Math.min(semanticWeight, Math.round((semanticWeight * (z + 1)) / 3)));
      const primary = essay.primary === prompt.primary && essay.primary !== "other" ? primaryWeight : 0;
      const essaySignals = new Set([...essay.families, ...essay.tags].filter((s) => s !== "other"));
      const promptSignals = new Set([...prompt.families, ...prompt.tags].filter((s) => s !== "other"));
      const shared = [...essaySignals].filter((s) => promptSignals.has(s)).length;
      const secondary = Math.min(SCORING.WEIGHTS.normal.secondary, shared * 7);
      // Unknown on either side is neutral, never a match: 224 of 553 records
      // have no function, and `null === null` would have handed every one of
      // those pairs full credit for agreeing about nothing.
      let fn: number;
      if (!essay.fn || !prompt.fn) fn = weight / 2;
      else if (essay.fn === prompt.fn) fn = weight;
      else if (graded && isAdjacent(essay.fn, prompt.fn)) fn = Math.round(weight / 2);
      else fn = 0;
      const score = Math.max(0, Math.min(100, primary + semantic + secondary + fn));
      if (score >= 50) { bands.a50 += 1; if (essay.primary !== prompt.primary) bands.cross += 1; }
      if (score >= 60) bands.a60 += 1;
      if (score >= 70) bands.a70 += 1;
    }
  }
  return bands;
}

w("Each row rescores every distinct catalogue pair. `Out of` shows the maximum a");
w("pair could reach, which is the reason a weight cannot simply be lowered.");
w();
w("| Function rule | Weight | Redistributed to | Out of | ≥50 | ≥60 | ≥70 | Cross-category ≥50 |");
w("|---|---|---|---|---|---|---|---|");
const configs: [string, number, boolean, "semantic" | "primary" | "none"][] = [
  ["all-or-nothing (today)", 20, false, "none"],
  ["graded, half credit for adjacent", 20, true, "none"],
  ["all-or-nothing", 15, false, "none"],
  ["graded", 15, true, "none"],
  ["graded, 5 points to semantic", 15, true, "semantic"],
  ["graded, 5 points to primary", 15, true, "primary"],
];
for (const [label, weight, graded, redistribute] of configs) {
  const totalWeight = SCORING.WEIGHTS.normal.primary + SCORING.WEIGHTS.normal.semantic + SCORING.WEIGHTS.normal.secondary + weight
    + (redistribute === "none" ? 0 : 20 - weight);
  const b = sweep(weight, graded, redistribute);
  w(`| ${label} | ${weight} | ${redistribute === "none" ? "— (max falls)" : redistribute} | ${totalWeight} | ${pct(b.a50, b.total)} | ${pct(b.a60, b.total)} | ${pct(b.a70, b.total)} | ${b.cross} |`);
}
w();

writeFileSync("docs/evaluation/factor-analysis.md", out.join("\n") + "\n");
console.log("Wrote docs/evaluation/factor-analysis.md");
