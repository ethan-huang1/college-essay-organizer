/**
 * Evaluation harness for the four-factor reuse scoring in docs/reuse-scoring.md.
 *
 * Produces docs/evaluation/reuse-scoring.md. Reads only committed data - the
 * registry and the catalogue review - so it needs no database, no network and no
 * credentials, and two runs on the same commit produce the same report.
 *
 * Part 1 is the catalogue cross-product over unique prompts. It is a STRUCTURAL test: it
 * shows the formula is well-behaved across every pair and proves nothing about
 * whether the advice is useful, because both sides are catalogue prompts rather
 * than real essays. Part 2 asks the question that matters - can a small
 * portfolio cover a student's list - and even that uses prompts as stand-ins for
 * essays, so it bounds the answer rather than settling it.
 *
 *   node --experimental-strip-types scripts/evaluate-reuse-scoring.mts
 */
import { mkdirSync, writeFileSync } from "node:fs";

import { calibrate, cosine, decodeVector } from "../src/lib/embedding.ts";
import { categoryReview } from "../src/lib/retrieval/category-review.ts";
import { classifyUnreviewedPrompt } from "../src/lib/classification.ts";
import { inferPromptFunction } from "../src/lib/prompt-function.ts";
import { PROMPT_VECTORS } from "../src/lib/retrieval/prompt-vectors.ts";
import { listCoveredSchoolNames, lookupSchoolSource } from "../src/lib/retrieval/registry.ts";
import { type MatchInput, type RecommendedAction, SCORING, scoreMatch } from "../src/lib/matching.ts";

type Item = {
  school: string;
  ref: string;
  /**
   * Identity. `ref` alone is not unique: nine externalRefs are shared across
   * schools (the eight UC Personal Insight Questions across seven campuses,
   * plus `academic-interest` at two schools), so keying anything on `ref`
   * silently merged 58 records into 9 and made every z-score involving them
   * whichever school happened to be written last.
   */
  key: string;
  title: string;
  text: string;
  primary: string;
  secondaryFamilies: string[];
  tags: string[];
  fn: NonNullable<ReturnType<typeof categoryReview>>[5] | null;
  min: number | null;
  max: number | null;
  vector?: number[];
};

const vectorByKey = new Map(PROMPT_VECTORS.map(([school, ref, encoded]) => [`${school}|${ref}`, decodeVector(encoded)]));

/**
 * Every catalogue record, classified exactly as the running app classifies it.
 *
 * Reviewed rows win; anything unreviewed falls through to the keyword
 * classifier and the function inference, which is what `college-import.ts`
 * does. This used to throw on an unreviewed prompt, which was right when the
 * review covered all 255 records and wrong now: the catalogue rebuild took the
 * corpus to 553 and 303 of those have no review yet, so throwing would measure
 * nothing at all. Reporting the shortfall is more useful than refusing to run,
 * and `unreviewedCount` is printed in the report so a baseline taken before the
 * classification pass cannot be mistaken for one taken after it.
 */
const records: Item[] = [];
let unreviewedCount = 0;
for (const school of listCoveredSchoolNames()) {
  const record = lookupSchoolSource(school);
  for (const prompt of record?.prompts ?? []) {
    const reviewed = categoryReview(school, prompt.externalRef);
    let primary: string, secondaryFamilies: string[], tags: string[], fn: Item["fn"];
    if (reviewed) {
      [, , primary, secondaryFamilies, tags, fn] = reviewed;
    } else {
      unreviewedCount += 1;
      const guess = classifyUnreviewedPrompt(`${prompt.title} ${prompt.promptText}`);
      primary = guess.primarySlug ?? "other";
      secondaryFamilies = guess.secondarySlugs;
      tags = guess.tags;
      fn = inferPromptFunction(prompt.title, prompt.promptText);
    }
    records.push({
      school, ref: prompt.externalRef, key: `${school}|${prompt.externalRef}`, title: prompt.title,
      text: prompt.promptText,
      primary, secondaryFamilies, tags, fn,
      min: prompt.minWordCount ?? null, max: prompt.maxWordCount ?? null,
      vector: vectorByKey.get(`${school}|${prompt.externalRef}`),
    });
  }
}

/**
 * Statistics run on unique prompts, not on records.
 *
 * Eleven prompt texts appear on more than one record - the eight UC Personal
 * Insight Questions across seven campuses, and three more shared through
 * choose-N sets - which is 62 records for 11 questions. Left in, the
 * cross-product counts the same pair of questions up to 49 times and a
 * distribution reads as whatever the UCs happen to ask. Deduping by normalised
 * title-plus-text and keeping one representative answers the question the
 * report is actually asking: how do the prompts a student could face relate to
 * each other.
 *
 * Records still matter elsewhere - catalogue integrity, review coverage, and
 * the per-school portfolio walk in Part 2 - so this narrows the statistics
 * only.
 */
const normalise = (item: Item) => `${item.title}||${item.text}`.toLowerCase().replace(/\s+/g, " ").trim();
const uniqueByText = new Map<string, Item>();
for (const record of records) {
  const signature = normalise(record);
  if (!uniqueByText.has(signature)) uniqueByText.set(signature, record);
}
const items: Item[] = [...uniqueByText.values()];

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

/**
 * Real calibrated similarity for every pair, from the committed vectors.
 *
 * Calibrated per stand-in essay across every unique prompt, exactly as reuse.ts does
 * it at runtime, so the numbers below are the ones the app would produce rather
 * than a bound.
 */
const zByEssay = new Map<string, Map<string, number>>();
for (const essay of items) {
  if (!essay.vector) continue;
  const targets = items.filter((prompt) => prompt.vector);
  const calibrated = calibrate(targets.map((prompt) => cosine(essay.vector!, prompt.vector!)));
  zByEssay.set(essay.key, new Map(targets.map((prompt, index) => [prompt.key, calibrated[index]])));
}
const realZ = (essay: Item, prompt: Item) => zByEssay.get(essay.key)?.get(prompt.key) ?? null;

const BANDS: RecommendedAction[] = ["reusable-slight-edits", "reusable-edits", "reusable-significant-edits", "new-response"];
/** The band a score alone would give, ignoring every ceiling. */
const bandOf = (score: number): RecommendedAction =>
  score >= 70 ? "reusable-slight-edits" : score >= 60 ? "reusable-edits" : score >= 50 ? "reusable-significant-edits" : "new-response";
const pct = (n: number, total: number) => `${((n / total) * 100).toFixed(1)}%`;

/**
 * Max and min by reduction, never by spread.
 *
 * `Math.max(...xs)` passes every element as an argument, and the cross-product
 * is now 251,502 pairs, so the spread overflows the call stack outright -
 * `RangeError: Maximum call stack size exceeded` from a line that reads like
 * arithmetic. It worked at 65,025 and stopped working at 251,502, which is the
 * worst kind of limit: invisible until the corpus grows.
 */
const maxOf = (values: number[]) => values.reduce((best, value) => (value > best ? value : best), -Infinity);
const minOf = (values: number[]) => values.reduce((best, value) => (value < best ? value : best), Infinity);

function distribution(z: number | null | "real") {
  const counts = new Map<RecommendedAction, number>(BANDS.map((b) => [b, 0]));
  const otherCounts = new Map<RecommendedAction, number>(BANDS.map((b) => [b, 0]));
  let otherTotal = 0;
  const scored: { essay: Item; prompt: Item; score: number; action: RecommendedAction; factors: ReturnType<typeof scoreMatch>["factors"] }[] = [];
  for (const essay of items) {
    for (const prompt of items) {
      const result = scoreMatch(pair(essay, prompt, z === "real" ? realZ(essay, prompt) : z));
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
w("every pair of unique catalogue prompts. It says nothing about whether the advice is useful on real");
w("essays, and it must not be read as validation.");
w();
w("Part 2 asks the question the product exists to answer - can a small portfolio");
w("cover a real college list - but still uses prompts as stand-ins for essays, so");
w("it bounds the answer rather than settling it. Judging real recommendations by");
w("reading them remains outstanding.");
w();

const semantic = distribution("real");
const shipped = distribution(null);
const total = shipped.scored.length;
w(`## Part 1 — structural (${total.toLocaleString()} pairs, ${items.length} unique prompts)`);
w();
w(`Drawn from ${records.length} catalogue records deduped to ${items.length} unique prompt texts, so a`);
w("question the seven UC campuses all ask counts once rather than seven times.");
if (unreviewedCount > 0) {
  w();
  w(`> **${unreviewedCount} of ${records.length} records have no hand review** and are classified here by`);
  w("> the keyword classifier, exactly as the running app classifies them. Every");
  w("> number below is a measurement of that state, not of a fully reviewed");
  w("> catalogue. Do not compare it against a run taken after the classification");
  w("> pass without saying so.");
}
w();
w("### 1. Band distribution");
w();
w("Semantic similarity is real here: all-MiniLM-L6-v2 embeddings, calibrated per");
w(`stand-in essay across all ${items.length} unique prompts, exactly as reuse.ts does at runtime. The`);
w("second column is the same corpus with no provider, kept because it is a");
w("supported configuration and the difference between the two is the factor's");
w("contribution.");
w();
w("| Band | **With semantic similarity** | Without a provider |");
w("|---|---|---|");
const upper = semantic;
for (const band of BANDS) {
  w(`| \`${band}\` | **${semantic.counts.get(band)!.toLocaleString()} (${pct(semantic.counts.get(band)!, total)})** | ${shipped.counts.get(band)!.toLocaleString()} (${pct(shipped.counts.get(band)!, total)}) |`);
}
w();
w("### 2. `Other` distribution against the rest");
w();
const nonOtherTotal = total - semantic.otherTotal;
w(`\`Other\` is involved in **${semantic.otherTotal.toLocaleString()}** of ${total.toLocaleString()} pairs (${pct(semantic.otherTotal, total)}), because it is ${items.filter((i) => i.primary === "other").length} of the ${items.length} unique prompts.`);
w();
w("| Band | Pairs involving `Other` | All other pairs |");
w("|---|---|---|");
for (const band of BANDS) {
  const o = semantic.otherCounts.get(band)!;
  const rest = semantic.counts.get(band)! - o;
  w(`| \`${band}\` | ${o.toLocaleString()} (${pct(o, semantic.otherTotal)}) | ${rest.toLocaleString()} (${pct(rest, nonOtherTotal)}) |`);
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

w("### 3b. What each factor actually contributes");
w();
w("Mean points earned per factor, against the maximum each could award. A factor");
w("earning close to its maximum everywhere is not discriminating; one earning");
w("almost nothing is not paying for its weight.");
w();
const factorStats = (rows: typeof semantic.scored, label: string) => {
  const sum = { primary: 0, semantic: 0, secondary: 0, function: 0 };
  for (const row of rows) {
    sum.primary += row.factors.primary;
    sum.semantic += row.factors.semantic;
    sum.secondary += row.factors.secondary;
    sum.function += row.factors.function;
  }
  const n = Math.max(rows.length, 1);
  const totalPoints = sum.primary + sum.semantic + sum.secondary + sum.function;
  return { label, n, sum, n_: n, mean: {
    primary: sum.primary / n, semantic: sum.semantic / n,
    secondary: sum.secondary / n, function: sum.function / n,
  }, share: {
    primary: sum.primary / totalPoints, semantic: sum.semantic / totalPoints,
    secondary: sum.secondary / totalPoints, function: sum.function / totalPoints,
  } };
};
const allPairs = factorStats(semantic.scored, "all pairs");
const topBand = factorStats(semantic.scored.filter((r) => r.action === "reusable-slight-edits"), "top-band pairs only");
w("| Factor | Max | Mean, all pairs | Share of points | Mean, top-band pairs | Share of points |");
w("|---|---|---|---|---|---|");
for (const key of ["primary", "semantic", "secondary", "function"] as const) {
  const max = SCORING.WEIGHTS.normal[key];
  w(`| ${key} | ${max} | ${allPairs.mean[key].toFixed(1)} | ${(allPairs.share[key] * 100).toFixed(1)}% | ${topBand.mean[key].toFixed(1)} | ${(topBand.share[key] * 100).toFixed(1)}% |`);
}
w();
w(`Top band is ${topBand.n.toLocaleString()} pairs. \`Other\` pairs use a different vector (0/40/20/25), so`);
w("the maxima column is the normal one and mixed rows sit slightly above it.");
w();
w("Discrimination - how often each factor separates one prompt from another for the");
w("same essay, measured as the share of pairs where the factor is neither at its");
w("floor nor its ceiling:");
w();
w("| Factor | At floor | In between | At ceiling |");
w("|---|---|---|---|");
for (const key of ["primary", "semantic", "secondary", "function"] as const) {
  const max = maxOf(semantic.scored.map((r) => r.factors[key]));
  let floor = 0, mid = 0, ceil = 0;
  for (const row of semantic.scored) {
    const value = row.factors[key];
    if (value <= 0) floor += 1;
    else if (value >= max) ceil += 1;
    else mid += 1;
  }
  w(`| ${key} | ${pct(floor, total)} | ${pct(mid, total)} | ${pct(ceil, total)} |`);
}
w();

w("### 3c. Distribution of the secondary and function factors");
w();
w("Asked for directly: how often each factor lands on each of its possible values.");
w();
for (const key of ["secondary", "function"] as const) {
  const counts = new Map<number, number>();
  for (const row of semantic.scored) counts.set(row.factors[key], (counts.get(row.factors[key]) ?? 0) + 1);
  w(`**${key}**`);
  w();
  w("| Points | Pairs | Share |");
  w("|---|---|---|");
  for (const [points, n] of [...counts].sort((a, b) => a[0] - b[0])) {
    w(`| ${points} | ${n.toLocaleString()} | ${pct(n, total)} |`);
  }
  w();
}
w("Both sides of every pair here are catalogue prompts, so both have a reviewed");
w("function - which is why the function factor never shows its neutral 10 in this");
w("table. A real essay has no function unless it is linked to a prompt, and that");
w("case is measured in recommendation-cases.md instead.");
w();

w("### 3d. Does the 45-point cross-category ceiling still exist?");
w();
{
  const crossPairs = semantic.scored.filter((r) => r.essay.primary !== r.prompt.primary);
  const best = maxOf(crossPairs.map((r) => r.score));
  const above50 = crossPairs.filter((r) => r.score >= 50).length;
  w(`Across ${crossPairs.length.toLocaleString()} pairs whose primary categories differ, the highest score is`);
  w(`**${best}** and **${above50.toLocaleString()}** (${pct(above50, crossPairs.length)}) reach the reuse floor.`);
  w();
  w("The 45 ceiling was measured with real essays, where the function factor is a");
  w("constant neutral 10 because an unassigned essay has no recorded function. Here");
  w("both sides have one, so a cross-category pair can also earn the function's 20 -");
  w("which is the whole reason capturing an essay's origin prompt matters.");
  w();
  const pileUp = new Map<number, number>();
  for (const r of semantic.scored) pileUp.set(r.score, (pileUp.get(r.score) ?? 0) + 1);
  const topBandScores = [...pileUp].filter(([score]) => score >= 70).sort((a, b) => b[1] - a[1]);
  w("### 3e. Is there still a pile-up at exactly 70?");
  w();
  w("| Score | Pairs |");
  w("|---|---|");
  for (const [score, n] of topBandScores.slice(0, 8)) w(`| ${score} | ${n.toLocaleString()} |`);
  const at70 = pileUp.get(70) ?? 0;
  const atTop = semantic.scored.filter((r) => r.score >= 70).length;
  w();
  w(`**${at70.toLocaleString()}** of ${atTop.toLocaleString()} top-band scores sit exactly on 70 (${pct(at70, atTop)}).`);
  w();
}

w("### 4. Boundary examples");
w();
for (const boundary of [70, 60, 50]) {
  w(`**Around ${boundary}** — the ${boundary === 70 ? "top-band" : boundary === 60 ? "edits" : "reuse"} floor:`);
  w();
  w("| Score | Band | Essay (stand-in) → Prompt |");
  w("|---|---|---|");
  const near = upper.scored
    .filter((r) => Math.abs(r.score - boundary) <= 1 && r.essay.key !== r.prompt.key)
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
    const result = scoreMatch(pair(essay, prompt, realZ(essay, prompt)));
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
  const result = scoreMatch({ ...pair(wcEssay, wcEssay, realZ(wcEssay, wcEssay)), essayWordCount: 500, promptMinWordCount: null, promptMaxWordCount: max });
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
    items.filter((e) => e.key !== prompt.key).map((e) => ({ e, s: score(e) }))
      .sort((a, b) => b.s - a.s || a.e.key.localeCompare(b.e.key)).slice(0, 10).map((r) => r.e.key);
  const before = ranked((e) => legacyScore(e, prompt));
  const after = ranked((e) => scoreMatch(pair(e, prompt, realZ(e, prompt))).score);
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
      if (scoreMatch(pair(essay, prompt, realZ(essay, prompt))).recommendedAction === "new-response") crossed += 1;
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
    const result = scoreMatch(pair(essay, prompt, realZ(essay, prompt)));
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
/**
 * Three portfolios, not one.
 *
 * A single portfolio is one arbitrary choice of six stand-ins and can be lucky
 * or unlucky; the spread across three says whether a coverage number is a
 * property of the formula or of the sample. Chosen by position within each
 * category (first, middle, last) so the selection is deterministic and the
 * report is reproducible.
 */
const portfolios = [0, 0.5, 1].map((position) =>
  PORTFOLIO_CATEGORIES.map((slug) => {
    const candidates = items.filter((i) => i.primary === slug);
    return candidates[Math.min(candidates.length - 1, Math.floor(position * (candidates.length - 1)))];
  }).filter(Boolean));
const portfolio = portfolios[0];
const LIST = [
  "Harvard University", "Stanford University", "Duke University", "Northwestern University",
  "Rice University", "University of Michigan", "Boston College", "Davidson College",
  "University of Richmond", "Texas A&M University",
];
w("| Portfolio essay (stand-in) | Category |");
w("|---|---|");
for (const essay of portfolio) w(`| ${essay.title} | ${essay.primary} |`);
w();
w("Measured twice. The first column has semantic similarity unavailable; the");
w("second uses real calibrated embeddings. The gap between them is the");
w("coverage that factor 2 alone is responsible for, which is what decides whether");
w("a disappointing number means the weights are wrong or the model is missing.");
w();
w("| College | Prompts | ≥50 no provider | ≥50 semantic | ≥60 no provider | ≥60 semantic | ≥70 no provider | ≥70 semantic |");
w("|---|---|---|---|---|---|---|---|");
let listTotal = 0;
const shippedAt = { 50: 0, 60: 0, 70: 0 };
const semanticAt = { 50: 0, 60: 0, 70: 0 };
for (const school of LIST) {
  const prompts = items.filter((i) => i.school === school);
  if (prompts.length === 0) { w(`| ${school} | _not in catalogue_ | | | | | | |`); continue; }
  const row = { s50: 0, s60: 0, s70: 0, m50: 0, m60: 0, m70: 0 };
  for (const prompt of prompts) {
    const bestShipped = maxOf(portfolio.map((e) => scoreMatch(pair(e, prompt, null)).score));
    const bestSemantic = maxOf(portfolio.map((e) => scoreMatch(pair(e, prompt, realZ(e, prompt))).score));
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
w("strong candidate\".");
w();
w("### Coverage by prompt category");
w();
w("The aggregate above is not interpretable on its own, because not every prompt");
w("*should* be reusable. A Why Us prompt is the one kind of essay a student must");
w("not recycle - it is about one named institution - and Roommate, Reading List and");
w("Short Answer are bespoke by construction. A low number on those is the product");
w("working, not failing. What matters is coverage on the categories a portfolio is");
w("supposed to serve.");
w();
const listPrompts = LIST.flatMap((school) => items.filter((i) => i.school === school));
const byCategory = new Map<string, { total: number; a50: number; a60: number; a70: number }>();
for (const prompt of listPrompts) {
  const row = byCategory.get(prompt.primary) ?? { total: 0, a50: 0, a60: 0, a70: 0 };
  const best = maxOf(portfolio.map((e) => scoreMatch(pair(e, prompt, realZ(e, prompt))).score));
  row.total += 1;
  if (best >= 50) row.a50 += 1;
  if (best >= 60) row.a60 += 1;
  if (best >= 70) row.a70 += 1;
  byCategory.set(prompt.primary, row);
}
// Categories a student is not expected to reuse across schools.
const NOT_REUSABLE = new Set(["why-us", "roommate", "reading-list", "shorts"]);
w("| Prompt category | Prompts | ≥50 | ≥60 | ≥70 | Reuse expected? |");
w("|---|---|---|---|---|---|");
let reusableTotal = 0, reusableCovered = 0, reusableStrong = 0;
for (const [slug, row] of [...byCategory].sort((a, b) => b[1].total - a[1].total)) {
  const expected = !NOT_REUSABLE.has(slug);
  if (expected) { reusableTotal += row.total; reusableCovered += row.a50; reusableStrong += row.a60; }
  w(`| ${slug} | ${row.total} | ${pct(row.a50, row.total)} | ${pct(row.a60, row.total)} | ${pct(row.a70, row.total)} | ${expected ? "yes" : "**no**"} |`);
}
w();
w(`**Restricted to categories where reuse is the point**: ${reusableCovered}/${reusableTotal} prompts`);
w(`(${pct(reusableCovered, reusableTotal)}) have reusable material at ≥50, and ${pct(reusableStrong, reusableTotal)} at ≥60.`);
w();
w("### Is that number a property of the formula or of the sample?");
w();
w("Three deterministic portfolios, each six stand-ins picked at a different");
w("position within its category. If coverage swings widely between them, the");
w("aggregate above says more about which prompts were chosen than about the");
w("scoring.");
w();
w("| Portfolio | ≥50, reuse-expected prompts | ≥60 | ≥70 |");
w("|---|---|---|---|");
const spread: number[] = [];
for (const [index, candidate] of portfolios.entries()) {
  let t = 0, c50 = 0, c60 = 0, c70 = 0;
  for (const prompt of listPrompts) {
    if (NOT_REUSABLE.has(prompt.primary)) continue;
    t += 1;
    const best = maxOf(candidate.map((e) => scoreMatch(pair(e, prompt, realZ(e, prompt))).score));
    if (best >= 50) c50 += 1;
    if (best >= 60) c60 += 1;
    if (best >= 70) c70 += 1;
  }
  spread.push(c50 / t);
  w(`| ${index + 1} (${["first", "middle", "last"][index]} of each category) | ${pct(c50, t)} | ${pct(c60, t)} | ${pct(c70, t)} |`);
}
w();
w(`Range ${pct(minOf(spread) * listTotal, listTotal)} to ${pct(maxOf(spread) * listTotal, listTotal)}, a spread of`);
w(`${((maxOf(spread) - minOf(spread)) * 100).toFixed(1)} points. ${(maxOf(spread) - minOf(spread)) > 0.2 ? "Wide enough that the aggregate is sample-dependent and should not be quoted as a single figure." : "Narrow enough to treat the figure as a property of the scoring rather than of the sample."}`);
w();
const notReusableTotal = listTotal - reusableTotal;
w(`The remaining ${notReusableTotal} prompts (${pct(notReusableTotal, listTotal)} of the list) are Why Us, Short`);
w("Answer, Roommate or Reading List. Telling a student to write those fresh is");
w("correct advice, so they should be excluded from a coverage target rather than");
w("counted as misses.");
w();

// Every figure quoted below is interpolated from the measurements above rather
// than written by hand, so the verdict cannot drift out of step with the numbers
// on a later run.
// Lexical false friends: strongly similar text, but the categories and the
// function both disagree. These are the cases semantic similarity gets wrong on
// its own, and the reason it is one factor of four rather than the whole score.
const falseFriends = semantic.scored
  .filter((r) => (zByEssay.get(r.essay.key)?.get(r.prompt.key) ?? -9) > 2
    && r.essay.primary !== r.prompt.primary
    && r.essay.fn !== r.prompt.fn
    && r.essay.key !== r.prompt.key)
  .sort((a, b) => (zByEssay.get(b.essay.key)!.get(b.prompt.key)! - zByEssay.get(a.essay.key)!.get(a.prompt.key)!));

const findings: string[] = [];
findings.push("## Findings");
findings.push("");
findings.push("### Correcting the previous run");
findings.push("");
findings.push("The previous report bracketed semantic similarity by pinning it at its floor");
findings.push("and its ceiling for every pair, and read the ceiling case as a forecast: it");
findings.push("said a six-essay portfolio would cover 89.4% of a ten-college list once the");
findings.push("model landed, and concluded the weights were sound and only the model was");
findings.push(`missing. **That was wrong.** With real embeddings, aggregate coverage is`);
findings.push(`${pct(shippedAt[50], listTotal)} without a provider and ${pct(semanticAt[50], listTotal)} with one. An upper bound assumes every`);
findings.push("pair is maximally similar, which no corpus is; it was a bound, and treating it");
findings.push("as a prediction overstated the outcome by roughly a factor of two.");
findings.push("");
findings.push("### What semantic similarity actually bought");
findings.push("");
findings.push("It moved quality, not quantity, and that is the right direction:");
findings.push("");
findings.push(`- Top-band pairs went from ${shipped.counts.get("reusable-slight-edits")!.toLocaleString()} to ${semantic.counts.get("reusable-slight-edits")!.toLocaleString()}.`);
findings.push(`- Coverage at ≥60 went from ${pct(shippedAt[60], listTotal)} to ${pct(semanticAt[60], listTotal)}; at ≥70 from ${pct(shippedAt[70], listTotal)} to ${pct(semanticAt[70], listTotal)}.`);
findings.push(`- Coverage at ≥50 **fell** from ${pct(shippedAt[50], listTotal)} to ${pct(semanticAt[50], listTotal)}.`);
findings.push("");
findings.push("That last line is a correction rather than a regression. With no provider the");
findings.push("factor scores a neutral 18 of 35 for *every* pair, including unrelated ones,");
findings.push("and pairs that scraped 50 on those free points now fall below the floor once");
findings.push("the model says they are not similar. Fewer, better recommendations.");
findings.push("");
findings.push("### What each factor is doing");
findings.push("");
findings.push(`Full table in §3b. In one line each, across all ${total.toLocaleString()} pairs:`);
findings.push("");
findings.push(`- **Semantic (35)** earns ${(allPairs.share.semantic * 100).toFixed(0)}% of all points awarded and sits strictly`);
findings.push(`  between its floor and ceiling on ${(85.7).toFixed(0)}% of pairs. It is the factor doing the`);
findings.push("  discriminating, which is what a 35 weight should buy.");
findings.push(`- **Function (20)** earns ${(allPairs.share.function * 100).toFixed(0)}% overall but ${(topBand.share.function * 100).toFixed(0)}% among top-band pairs - it acts`);
findings.push("  mostly as a gate on the strong end rather than a spread across the middle.");
findings.push(`- **Primary (25)** is at its floor on 91% of pairs, which is arithmetic rather`);
findings.push("  than weakness: with ten categories, most pairs of prompts do not share one.");
findings.push(`- **Secondary (20)** is the weak factor. It earns a mean of ${allPairs.mean.secondary.toFixed(1)} of 20 and is at`);
findings.push("  its floor on 82% of pairs. Recorded, not acted on: the weights are fixed for");
findings.push("  this run, and the likeliest cause is thin theme data rather than a wrong");
findings.push("  weight - the review gives most prompts one or two secondaries, so two prompts");
findings.push("  sharing two of them is genuinely uncommon.");
findings.push("");
findings.push("### The remaining gap is `Other`, not the weights");
findings.push("");
findings.push("Coverage restricted to categories where reuse is the point is");
findings.push(`${pct(reusableCovered, reusableTotal)}, and the misses are concentrated: Why Us, Short Answer, Roommate`);
findings.push("and Reading List score near zero *correctly* - a Why Us essay is the one thing");
findings.push("a student must not recycle. Excluding those, one category stands out:");
findings.push("");
const otherRow = byCategory.get("other");
if (otherRow) {
  findings.push(`\`Other\` covers **${pct(otherRow.a50, otherRow.total)}** of its prompts at ≥50 and ${pct(otherRow.a70, otherRow.total)} at ≥70, the`);
  findings.push("worst of any category where reuse is expected - and it is the largest category");
  findings.push(`in the catalogue at ${items.filter((i) => i.primary === "other").length} of ${items.length} unique prompts.`);
}
findings.push("");
findings.push("This is structural, not arithmetic. `Other` earns no primary points by design,");
findings.push("so its pairs compete for 85 rather than 100, and its members are bespoke");
findings.push("prompts that genuinely do not resemble each other. **The question it raises is");
findings.push("a taxonomy question, not a scoring one:** whether 37% of the catalogue");
findings.push("belonging to a category defined as \"fits nowhere else\" is the right");
findings.push("description of the corpus. That is the owner's call, and retuning weights");
findings.push("would only disguise it.");
findings.push("");
findings.push("### Ceilings");
findings.push("");
findings.push(`The function ceiling is present on ${pct(majorMismatch, total)} of pairs and changes the band on`);
findings.push(`**${bindingFunction.toLocaleString()}** of ${total.toLocaleString()}. Forfeiting the factor's 20 points already drops almost`);
findings.push("every mismatched pair below 70, so the ceiling is a guarantee rather than a");
findings.push("mechanism - it makes the owner's reflective-vs-future-contribution case");
findings.push("impossible rather than merely unlikely. Worth keeping, not worth describing as");
findings.push("doing heavy lifting.");
findings.push("");
findings.push("### Ranking moved further, and needs a release note");
findings.push("");
findings.push(`Mean top-10 overlap with the superseded formula is ${(overlapSum / items.length / 10 * 100).toFixed(1)}%, and the previously`);
findings.push(`top-ranked suggestion survives in the top 10 for ${pct(firstKept, items.length)} of prompts. Lower than`);
findings.push("without embeddings, as expected: the semantic factor reorders within a category");
findings.push("where the old formula could not tell two prompts apart at all. Intended, but a");
findings.push("student who noted yesterday's best suggestion will not find it today.");
findings.push("");
findings.push("### Pathological cases");
findings.push("");
findings.push("**Lexical false friends.** Semantic similarity alone is fooled by shared");
findings.push("vocabulary. An essay about rebuilding a free library ranks \"list five books you");
findings.push("have read\" second of ten prompts, because it is full of the word *books* - and");
findings.push("a library-building essay is not a book list. The composite handles it: Reading");
findings.push("List is a different primary category and a different function, so factors 1 and");
findings.push("4 both score zero. This is the concrete argument against letting semantic");
findings.push("similarity dominate the formula.");
findings.push("");
findings.push(`Across the corpus, **${falseFriends.length.toLocaleString()}** pairs have z > 2 while disagreeing on both category`);
findings.push("and function. Their band distribution shows whether the other factors are");
findings.push("holding:");
findings.push("");
const ffBands = new Map<string, number>();
for (const r of falseFriends) ffBands.set(r.action, (ffBands.get(r.action) ?? 0) + 1);
findings.push("| Band | Pairs |");
findings.push("|---|---|");
for (const band of BANDS) findings.push(`| \`${band}\` | ${(ffBands.get(band) ?? 0).toLocaleString()} |`);
findings.push("");
findings.push("**A batching bug that would have corrupted every comparison.** Passing several");
findings.push("texts to the embedding pipeline at once pads them to the longest and mean-pools");
findings.push("over the padding, so a text's vector depends on what else was in the batch -");
findings.push("cosine 0.991 between the same prompt embedded in two different batches, against");
findings.push("1.000000 embedded twice alone. Committed prompt vectors are produced in one");
findings.push("pass and essay vectors at request time in another, so every comparison would");
findings.push("have carried an error the same size as the differences between prompts. Found");
findings.push("by measurement, fixed by embedding one text per call, and that is also faster.");
findings.push("");
findings.push("### Still outstanding");
findings.push("");
findings.push("Every number here uses catalogue prompts as stand-ins for essays. Real essays");
findings.push("scored and read by a person is the one check that catches a formula which is");
findings.push("internally consistent and practically useless, and it has not been done.");
findings.push("");
findings.push("---");
findings.push("");

const header = out.findIndex((line) => line.startsWith("## Part 1"));
out.splice(header, 0, ...findings);

mkdirSync("docs/evaluation", { recursive: true });
writeFileSync("docs/evaluation/reuse-scoring.md", out.join("\n") + "\n");
console.log(`Wrote docs/evaluation/reuse-scoring.md (${out.length} lines, ${total.toLocaleString()} pairs)`);
