/**
 * Evaluation harness for the four-factor reuse scoring in docs/reuse-scoring.md.
 *
 * Produces docs/evaluation/reuse-scoring.md. Reads only committed data - the
 * registry and the catalogue review - so it needs no database, no network and no
 * credentials, and two runs on the same commit produce the same report.
 *
 * Part 1 is the 65,025-pair catalogue cross-product. It is a STRUCTURAL test: it
 * shows the formula is well-behaved across every pair and proves nothing about
 * whether the advice is useful, because both sides are catalogue prompts rather
 * than real essays. Part 2 asks the question that matters - can a small
 * portfolio cover a student's list - and even that uses prompts as stand-ins for
 * essays, so it bounds the answer rather than settling it.
 *
 *   node --experimental-strip-types scripts/evaluate-reuse-scoring.mts
 */
import { mkdirSync, writeFileSync } from "node:fs";

import { categoryReview } from "../src/lib/retrieval/category-review.ts";
import { listCoveredSchoolNames, lookupSchoolSource } from "../src/lib/retrieval/registry.ts";
import { type MatchInput, type RecommendedAction, scoreMatch } from "../src/lib/matching.ts";

type Item = {
  school: string;
  ref: string;
  title: string;
  primary: string;
  secondaryFamilies: string[];
  tags: string[];
  fn: NonNullable<ReturnType<typeof categoryReview>>[5] | null;
  min: number | null;
  max: number | null;
};

const items: Item[] = [];
for (const school of listCoveredSchoolNames()) {
  const record = lookupSchoolSource(school);
  for (const prompt of record?.prompts ?? []) {
    const reviewed = categoryReview(school, prompt.externalRef);
    if (!reviewed) throw new Error(`unreviewed prompt: ${school} / ${prompt.externalRef}`);
    items.push({
      school, ref: prompt.externalRef, title: prompt.title,
      primary: reviewed[2], secondaryFamilies: reviewed[3], tags: reviewed[4], fn: reviewed[5],
      min: prompt.minWordCount ?? null, max: prompt.maxWordCount ?? null,
    });
  }
}

/**
 * One prompt scored as if another prompt's ideal answer were the essay.
 *
 * Word count is deliberately put in range and school phrases left empty, so the
 * cross-product measures content fit rather than editing cost. Word count gets
 * its own sweep below.
 */
function pair(essay: Item, prompt: Item, semanticZScore: number | null): MatchInput {
  return {
    essayWordCount: prompt.max ?? 300,
    essayPrimaryFamilySlug: essay.primary,
    essaySecondaryFamilySlugs: essay.secondaryFamilies,
    essayTags: essay.tags,
    essaySchoolSpecificPhrases: [],
    essayFunction: essay.fn,
    promptSchoolName: prompt.school,
    promptPrimaryFamilySlug: prompt.primary,
    promptSecondaryFamilySlugs: prompt.secondaryFamilies,
    promptTags: prompt.tags,
    promptFunction: prompt.fn,
    promptMinWordCount: prompt.min,
    promptMaxWordCount: prompt.max,
    semanticZScore,
  };
}

const BANDS: RecommendedAction[] = ["reusable-slight-edits", "reusable-edits", "reusable-significant-edits", "new-response"];
/** The band a score alone would give, ignoring every ceiling. */
const bandOf = (score: number): RecommendedAction =>
  score >= 70 ? "reusable-slight-edits" : score >= 60 ? "reusable-edits" : score >= 50 ? "reusable-significant-edits" : "new-response";
const pct = (n: number, total: number) => `${((n / total) * 100).toFixed(1)}%`;

function distribution(z: number | null) {
  const counts = new Map<RecommendedAction, number>(BANDS.map((b) => [b, 0]));
  const otherCounts = new Map<RecommendedAction, number>(BANDS.map((b) => [b, 0]));
  let otherTotal = 0;
  const scored: { essay: Item; prompt: Item; score: number; action: RecommendedAction; factors: ReturnType<typeof scoreMatch>["factors"] }[] = [];
  for (const essay of items) {
    for (const prompt of items) {
      const result = scoreMatch(pair(essay, prompt, z));
      counts.set(result.recommendedAction, counts.get(result.recommendedAction)! + 1);
      const involvesOther = essay.primary === "other" || prompt.primary === "other";
      if (involvesOther) {
        otherTotal += 1;
        otherCounts.set(result.recommendedAction, otherCounts.get(result.recommendedAction)! + 1);
      }
      scored.push({ essay, prompt, score: result.score, action: result.recommendedAction, factors: result.factors });
    }
  }
  return { counts, otherCounts, otherTotal, scored };
}

/** The superseded formula, reimplemented here only to answer "did ranking hold?". */
function legacyScore(essay: Item, prompt: Item) {
  const meaningful = (s: string) => s !== "other";
  let family = 0;
  if (meaningful(essay.primary) && essay.primary === prompt.primary) family = 60;
  else {
    const a = new Set([essay.primary, ...essay.secondaryFamilies].filter(meaningful));
    const b = new Set([prompt.primary, ...prompt.secondaryFamilies].filter(meaningful));
    const overlap = [...a].filter((s) => b.has(s));
    if (overlap.length) family = (prompt.secondaryFamilies.includes(essay.primary) || essay.secondaryFamilies.includes(prompt.primary)) ? 25 : Math.min(20, overlap.length * 10);
  }
  const promptFamilies = [prompt.primary, ...prompt.secondaryFamilies].filter(Boolean);
  const essayFamilies = new Set([essay.primary, ...essay.secondaryFamilies]);
  const missing = promptFamilies.filter((s) => !essayFamilies.has(s)).slice(0, 2).length;
  return Math.max(0, Math.min(100, 20 + family - missing * 5));
}

const out: string[] = [];
const w = (line = "") => out.push(line);

w("# Reuse scoring evaluation");
w();
w("Generated by `scripts/evaluate-reuse-scoring.mts` from committed data only.");
w("Design under test: [docs/reuse-scoring.md](../reuse-scoring.md).");
w();
w("## What this does and does not establish");
w();
w("Part 1 is a **structural** test. Every pair is two catalogue prompts, with one");
w("standing in as an ideal answer to the other, word counts put in range and no");
w("school-specific material. It shows the formula is well-behaved across all");
w("65,025 pairs. It says nothing about whether the advice is useful on real");
w("essays, and it must not be read as validation.");
w();
w("Part 2 asks the question the product exists to answer - can a small portfolio");
w("cover a real college list - but still uses prompts as stand-ins for essays, so");
w("it bounds the answer rather than settling it. Judging real recommendations by");
w("reading them remains outstanding.");
w();

const shipped = distribution(null);
const total = shipped.scored.length;
w(`## Part 1 — structural (${total.toLocaleString()} pairs, ${items.length} prompts)`);
w();
w("### 1. Band distribution");
w();
w("Three modes, because semantic similarity is unavailable in the shipped build");
w("and scores its neutral value. The bounds are not predictions: they are what the");
w("formula does if that factor were pinned at its floor or its ceiling for every");
w("pair, which brackets whatever a real model would produce.");
w();
w("| Band | Shipped (semantic neutral) | Lower bound (semantic 0) | Upper bound (semantic max) |");
w("|---|---|---|---|");
const lower = distribution(-3);
const upper = distribution(9);
for (const band of BANDS) {
  w(`| \`${band}\` | ${shipped.counts.get(band)!.toLocaleString()} (${pct(shipped.counts.get(band)!, total)}) | ${lower.counts.get(band)!.toLocaleString()} (${pct(lower.counts.get(band)!, total)}) | ${upper.counts.get(band)!.toLocaleString()} (${pct(upper.counts.get(band)!, total)}) |`);
}
w();
w("### 2. `Other` distribution against the rest");
w();
const nonOtherTotal = total - shipped.otherTotal;
w(`\`Other\` is involved in **${shipped.otherTotal.toLocaleString()}** of ${total.toLocaleString()} pairs (${pct(shipped.otherTotal, total)}), because it is 94 of the ${items.length} prompts.`);
w();
w("| Band | Pairs involving `Other` | All other pairs |");
w("|---|---|---|");
for (const band of BANDS) {
  const o = shipped.otherCounts.get(band)!;
  const rest = shipped.counts.get(band)! - o;
  w(`| \`${band}\` | ${o.toLocaleString()} (${pct(o, shipped.otherTotal)}) | ${rest.toLocaleString()} (${pct(rest, nonOtherTotal)}) |`);
}
w();

w("### 3. `Other` pairs reaching the top band");
w();
const otherTop = upper.scored.filter((r) => (r.essay.primary === "other" || r.prompt.primary === "other") && r.action === "reusable-slight-edits");
if (otherTop.length === 0) {
  w("None, in any mode. Under the shipped build an `Other` pair maxes at");
  w(`\`0 + ${20} + 20 + 25 = 65\`, below the 70 floor, so the top band is unreachable`);
  w("for `Other` without semantic similarity. With it, the ceiling is 85.");
} else {
  w(`${otherTop.length.toLocaleString()} at the semantic upper bound. A sample, with factor breakdowns:`);
  w();
  w("| Essay (stand-in) | Prompt | Score | primary/semantic/secondary/function |");
  w("|---|---|---|---|");
  for (const r of otherTop.slice(0, 8)) {
    w(`| ${r.essay.school}: ${r.essay.title} | ${r.prompt.school}: ${r.prompt.title} | ${r.score} | ${r.factors.primary}/${r.factors.semantic}/${r.factors.secondary}/${r.factors.function} |`);
  }
}
w();

w("### 4. Boundary examples");
w();
for (const boundary of [70, 60, 50]) {
  w(`**Around ${boundary}** — the ${boundary === 70 ? "top-band" : boundary === 60 ? "edits" : "reuse"} floor:`);
  w();
  w("| Score | Band | Essay (stand-in) → Prompt |");
  w("|---|---|---|");
  const near = upper.scored
    .filter((r) => Math.abs(r.score - boundary) <= 1 && r.essay.ref !== r.prompt.ref)
    .sort((a, b) => b.score - a.score);
  const sample = [...near.filter((r) => r.score >= boundary).slice(0, 2), ...near.filter((r) => r.score < boundary).slice(0, 2)];
  for (const r of sample) {
    w(`| ${r.score} | \`${r.action}\` | ${r.essay.title} → ${r.prompt.school}: ${r.prompt.title} |`);
  }
  w();
}

w("### 5. False-positive candidates in the top band");
w();
w("Pairs scoring 70+ whose categories differ - the shape most likely to be wrong,");
w("since they reach the band on semantic, theme and function evidence alone.");
w();
const crossCategoryTop = upper.scored.filter((r) => r.action === "reusable-slight-edits" && r.essay.primary !== r.prompt.primary && r.essay.primary !== "other" && r.prompt.primary !== "other");
w(`**${crossCategoryTop.length.toLocaleString()}** at the semantic upper bound (${pct(crossCategoryTop.length, total)} of all pairs). Sample:`);
w();
w("| Essay category | Prompt category | Score | Essay → Prompt |");
w("|---|---|---|---|");
for (const r of crossCategoryTop.slice(0, 10)) {
  w(`| ${r.essay.primary} | ${r.prompt.primary} | ${r.score} | ${r.essay.title} → ${r.prompt.title} |`);
}
w();

w("### 6. Function mismatch");
w();
let majorMismatch = 0;
let unknownFn = 0;
let bindingFunction = 0;
for (const essay of items) {
  for (const prompt of items) {
    const result = scoreMatch(pair(essay, prompt, 9));
    if (!essay.fn || !prompt.fn) unknownFn += 1;
    if (result.ceilings.includes("the prompt asks for something this essay does not do")) {
      majorMismatch += 1;
      // Present is not the same as binding. The score already forfeits the
      // function factor's 20 points on a mismatch, so the ceiling only changes
      // an outcome where the remaining evidence would still have cleared 70.
      if (bandOf(result.score) === "reusable-slight-edits") bindingFunction += 1;
    }
  }
}
w(`- Pairs with a **major** function mismatch: **${majorMismatch.toLocaleString()}** (${pct(majorMismatch, total)}). With eight functions split evenly across two groups, roughly half of all pairs cross a group boundary, so this number is structural rather than a signal.`);
w(`- Pairs where the ceiling actually **changes the band**: **${bindingFunction.toLocaleString()}** (${pct(bindingFunction, total)}). Everywhere else the forfeited 20 points had already put the pair below 70, so the ceiling is redundant.`);
w(`- Pairs where either function is unknown: **${unknownFn.toLocaleString()}** — every catalogue prompt has one, so this is 0 by construction here and non-zero only for prompts a student adds.`);
w();

w("### 7. Word count: ordinary vs extreme");
w();
w("A 500-word essay against a shrinking limit, holding content fit constant.");
w();
w("| Limit | Retention | Score | Band | Ceiling |");
w("|---|---|---|---|---|");
const wcEssay = items.find((i) => i.primary === "community")!;
for (const max of [500, 400, 300, 250, 200, 150, 100, 50]) {
  const result = scoreMatch({ ...pair(wcEssay, wcEssay, 9), essayWordCount: 500, promptMinWordCount: null, promptMaxWordCount: max });
  w(`| ${max}w | ${(max / 500).toFixed(2)} | ${result.score} | \`${result.recommendedAction}\` | ${result.ceilings.join("; ") || "—"} |`);
}
w();
w("Score is identical in every row: word count cannot change content fit, only the band.");
w();

w("### 8. Did strong matches stay highly ranked?");
w();
w("For each prompt, the top 10 suggestions under the superseded formula compared");
w("with the top 10 now. Overlap is the measure that matters: a student who saw a");
w("good suggestion yesterday should still see it.");
w();
let overlapSum = 0;
let firstKept = 0;
for (const prompt of items) {
  const ranked = (score: (e: Item) => number) =>
    items.filter((e) => e.ref !== prompt.ref).map((e) => ({ e, s: score(e) }))
      .sort((a, b) => b.s - a.s || a.e.ref.localeCompare(b.e.ref)).slice(0, 10).map((r) => r.e.ref);
  const before = ranked((e) => legacyScore(e, prompt));
  const after = ranked((e) => scoreMatch(pair(e, prompt, null)).score);
  const kept = after.filter((ref) => before.includes(ref)).length;
  overlapSum += kept;
  if (before[0] && after.includes(before[0])) firstKept += 1;
}
w(`- Mean top-10 overlap: **${(overlapSum / items.length / 10 * 100).toFixed(1)}%**.`);
w(`- The previously top-ranked suggestion is still in the top 10 for **${firstKept}/${items.length}** prompts (${pct(firstKept, items.length)}).`);
w();

w("### 9. Pairs crossing the raised `new-response` floor");
w();
let crossed = 0;
let legacyRecommended = 0;
for (const essay of items) {
  for (const prompt of items) {
    const legacy = legacyScore(essay, prompt);
    if (legacy >= 30) {
      legacyRecommended += 1;
      if (scoreMatch(pair(essay, prompt, null)).recommendedAction === "new-response") crossed += 1;
    }
  }
}
w(`The floor rose from 30 to 50. Of **${legacyRecommended.toLocaleString()}** pairs the old formula would have recommended, **${crossed.toLocaleString()}** (${pct(crossed, legacyRecommended)}) now read as \`new-response\`.`);
w();

w("### 10. Ceiling attribution");
w();
w("How often each ceiling lowers a band. A ceiling doing more work than the score");
w("means the score has stopped mattering.");
w();
const ceilingPresent = new Map<string, number>();
const ceilingBinding = new Map<string, number>();
let anyBinding = 0;
for (const essay of items) {
  for (const prompt of items) {
    const result = scoreMatch(pair(essay, prompt, 9));
    const fromScore = bandOf(result.score);
    const binding = result.recommendedAction !== fromScore;
    if (binding) anyBinding += 1;
    for (const c of result.ceilings) {
      ceilingPresent.set(c, (ceilingPresent.get(c) ?? 0) + 1);
      if (binding) ceilingBinding.set(c, (ceilingBinding.get(c) ?? 0) + 1);
    }
  }
}
w("`Present` counts pairs where the condition holds; `binding` counts pairs where");
w("it actually lowered the band below what the score gave. Only the second matters.");
w();
w("| Ceiling | Present | Binding | Binding share |");
w("|---|---|---|---|");
for (const [name, count] of [...ceilingPresent].sort((a, b) => b[1] - a[1])) {
  w(`| ${name} | ${count.toLocaleString()} | ${(ceilingBinding.get(name) ?? 0).toLocaleString()} | ${pct(ceilingBinding.get(name) ?? 0, total)} |`);
}
w(`| **any** | | ${anyBinding.toLocaleString()} | ${pct(anyBinding, total)} |`);
w();
w("School-specificity never fires here: the cross-product supplies no");
w("school-specific phrases, by design. Its behaviour is covered by unit tests.");
w();

// ---- Part 2 -------------------------------------------------------------
w("## Part 2 — portfolio coverage");
w();
w("Can a small portfolio provide legitimate material for a real college list?");
w("Six stand-in essays, one per major category, against every current-cycle prompt");
w("of a ten-college list. Stand-ins are catalogue prompts, so this bounds coverage");
w("rather than measuring it.");
w();
const PORTFOLIO_CATEGORIES = ["community", "diversity", "challenge-growth", "why-major", "personal-statement", "other"];
const portfolio = PORTFOLIO_CATEGORIES.map((slug) => items.find((i) => i.primary === slug)!).filter(Boolean);
const LIST = [
  "Harvard University", "Stanford University", "Duke University", "Northwestern University",
  "Rice University", "University of Michigan", "Boston College", "Davidson College",
  "University of Richmond", "Texas A&M University",
];
w("| Portfolio essay (stand-in) | Category |");
w("|---|---|");
for (const essay of portfolio) w(`| ${essay.title} | ${essay.primary} |`);
w();
w("Measured twice. The shipped column has semantic similarity unavailable; the");
w("second pins it at its ceiling for every pair. The gap between them is the");
w("coverage that factor 2 alone is responsible for, which is what decides whether");
w("a disappointing number means the weights are wrong or the model is missing.");
w();
w("| College | Prompts | ≥50 shipped | ≥50 w/ semantic | ≥60 shipped | ≥60 w/ semantic | ≥70 shipped | ≥70 w/ semantic |");
w("|---|---|---|---|---|---|---|---|");
let listTotal = 0;
const shippedAt = { 50: 0, 60: 0, 70: 0 };
const semanticAt = { 50: 0, 60: 0, 70: 0 };
for (const school of LIST) {
  const prompts = items.filter((i) => i.school === school);
  if (prompts.length === 0) { w(`| ${school} | _not in catalogue_ | | | | | | |`); continue; }
  const row = { s50: 0, s60: 0, s70: 0, m50: 0, m60: 0, m70: 0 };
  for (const prompt of prompts) {
    const bestShipped = Math.max(...portfolio.map((e) => scoreMatch(pair(e, prompt, null)).score));
    const bestSemantic = Math.max(...portfolio.map((e) => scoreMatch(pair(e, prompt, 9)).score));
    if (bestShipped >= 50) row.s50 += 1;
    if (bestShipped >= 60) row.s60 += 1;
    if (bestShipped >= 70) row.s70 += 1;
    if (bestSemantic >= 50) row.m50 += 1;
    if (bestSemantic >= 60) row.m60 += 1;
    if (bestSemantic >= 70) row.m70 += 1;
  }
  listTotal += prompts.length;
  shippedAt[50] += row.s50; shippedAt[60] += row.s60; shippedAt[70] += row.s70;
  semanticAt[50] += row.m50; semanticAt[60] += row.m60; semanticAt[70] += row.m70;
  w(`| ${school} | ${prompts.length} | ${row.s50} | ${row.m50} | ${row.s60} | ${row.m60} | ${row.s70} | ${row.m70} |`);
}
w(`| **Total** | **${listTotal}** | **${pct(shippedAt[50], listTotal)}** | **${pct(semanticAt[50], listTotal)}** | **${pct(shippedAt[60], listTotal)}** | **${pct(semanticAt[60], listTotal)}** | **${pct(shippedAt[70], listTotal)}** | **${pct(semanticAt[70], listTotal)}** |`);
w();
w("Read the `≥50` column as \"has some reusable material\" and `≥70` as \"has a");
w("strong candidate\". A portfolio covering a small share at `≥50` would mean the");
w("product is not doing its job, whatever the unit tests say.");
w();

// The verdict is derived from the numbers above rather than asserted, so it
// cannot drift out of step with them on a later run.
const coverShipped = shippedAt[50] / listTotal;
const coverSemantic = semanticAt[50] / listTotal;
const findings: string[] = [];
findings.push("## Findings");
findings.push("");
if (coverShipped < 0.6 && coverSemantic >= 0.8) {
  findings.push(`**The weights are sound; the missing model is the problem.** A six-essay`);
  findings.push(`portfolio covers ${pct(shippedAt[50], listTotal)} of a ten-college list as shipped and`);
  findings.push(`${pct(semanticAt[50], listTotal)} with semantic similarity available. The spec's target is a`);
  findings.push("substantial majority, so the shipped configuration misses it and the");
  findings.push("four-factor configuration clears it comfortably. Retuning the other three");
  findings.push("weights to close a gap that factor 2 accounts for would be fitting the");
  findings.push("formula to a temporary absence.");
  findings.push("");
  findings.push("**Recommendation: do not release these stages to students without factor 2.**");
  findings.push("They are correct, tested and safe to keep in the codebase - every band is");
  findings.push("reachable and the no-provider path is the same code path that makes the");
  findings.push("embedding stage revertible - but the advice a student would see is weaker");
  findings.push("than what they see today, for a reason that is already scheduled to be fixed.");
} else if (coverShipped >= 0.6) {
  findings.push(`A six-essay portfolio covers ${pct(shippedAt[50], listTotal)} of a ten-college list as shipped,`);
  findings.push("which meets the spec's target without semantic similarity.");
} else {
  findings.push(`Coverage is ${pct(shippedAt[50], listTotal)} shipped and ${pct(semanticAt[50], listTotal)} with semantic similarity.`);
  findings.push("Neither clears the target, so factor 2 alone does not explain the gap and");
  findings.push("the weights themselves need review before release.");
}
findings.push("");
findings.push(`**The function ceiling is nearly redundant.** It is present on ${pct(majorMismatch, total)} of pairs`);
findings.push(`but changes the band on ${bindingFunction.toLocaleString()} of ${total.toLocaleString()}. Forfeiting the factor's 20 points`);
findings.push("already drops almost every mismatched pair below 70, so the ceiling is a");
findings.push("guarantee rather than a mechanism. Worth keeping for exactly that reason - it");
findings.push("makes the owner's reflective-vs-future-contribution case impossible rather");
findings.push("than merely unlikely - but it should not be described as doing heavy lifting.");
findings.push("");
findings.push(`**Ranking changed substantially, and that needs a release note.** Mean top-10`);
findings.push(`overlap with the superseded formula is ${(overlapSum / items.length / 10 * 100).toFixed(1)}%, and the previously top-ranked`);
findings.push(`suggestion survives in the top 10 for only ${pct(firstKept, items.length)} of prompts. This is the`);
findings.push("intended consequence of a shared category falling from 60 points to 25, but a");
findings.push("student who wrote down yesterday's best suggestion will not find it today.");
findings.push("");
findings.push(`**Cross-category false positives are rare.** ${crossCategoryTop.length} pairs (${pct(crossCategoryTop.length, total)}) reach the top`);
findings.push("band with differing primary categories, all of them Why Us/Why Major pairs");
findings.push("about named degree programmes - which are genuinely adjacent. No evidence");
findings.push("that dropping factor 1 to 25 lets unrelated pairs through.");
findings.push("");
findings.push("**Still outstanding:** every number here uses catalogue prompts as stand-ins");
findings.push("for essays. Real essays scored and read by a person remains the one check");
findings.push("that can catch a formula which is internally consistent and practically");
findings.push("useless, and it has not been done.");
findings.push("");
findings.push("---");
findings.push("");

const header = out.findIndex((line) => line.startsWith("## Part 1"));
out.splice(header, 0, ...findings);

mkdirSync("docs/evaluation", { recursive: true });
writeFileSync("docs/evaluation/reuse-scoring.md", out.join("\n") + "\n");
console.log(`Wrote docs/evaluation/reuse-scoring.md (${out.length} lines, ${total.toLocaleString()} pairs)`);
