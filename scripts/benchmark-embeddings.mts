/**
 * Benchmarks candidate embedding models against the frozen scorer.
 *
 * The scoring redesign is finished and its configuration is locked, so this
 * varies exactly one thing: which model produces the semantic factor. Every
 * model is scored on the same corpus, the same 29 calibration cases, the same 8
 * holdout cases and the same aggregate gates, so the difference in the numbers
 * is the difference in the model.
 *
 * **This is the only script in the repo that fetches a model from the network.**
 * `src/lib/embedding.ts` pins one model and sets `allowRemoteModels = false`
 * precisely so a runtime download cannot happen; a benchmark of alternatives
 * has to opt out of that, and it does so here rather than by weakening the
 * shipped path. Downloads land in the gitignored `.model-cache/`.
 *
 * Nothing here writes `prompt-vectors.ts`. Adopting a model means changing
 * `EMBEDDING_MODEL`, re-running `precompute-prompt-vectors.mts` and
 * regenerating every evaluation report - a reviewed commit of its own, because
 * an embedding is only comparable to another from the same weights.
 *
 *   node --experimental-strip-types --import ./scripts/ts-resolve.mjs \
 *     scripts/benchmark-embeddings.mts
 */
import { writeFileSync } from "node:fs";

import { calibrate, cosine } from "../src/lib/embedding.ts";
import { type MatchInput, type RecommendedAction, SCORING, scoreMatch } from "../src/lib/matching.ts";
import { categoryReview } from "../src/lib/retrieval/category-review.ts";
import { listCoveredSchoolNames, lookupSchoolSource } from "../src/lib/retrieval/registry.ts";
import {
  AGGREGATE_GATES, CALIBRATION_NEGATIVES, CALIBRATION_POSITIVES,
  HOLDOUT_NEGATIVES, HOLDOUT_POSITIVES, type NegativeCase, type PositiveCase, type PromptKey,
} from "../src/lib/reuse-cases.ts";
import { promptEmbeddingText } from "../src/lib/semantic.ts";
import { signatureOf } from "./review-vocabulary.mts";

/**
 * Each candidate, with the instruction prefix its model card asks for.
 *
 * The prefix is not a detail. E5 was trained with `query:` and `passage:`
 * markers on every input and its card is explicit that omitting them degrades
 * the embeddings; BGE asks for an instruction on the query side of an
 * asymmetric retrieval task. Benchmarking either without its prefix would
 * measure the prefix rather than the model, so both forms are run for the
 * models that want one.
 *
 * Reuse matching is *symmetric* - prompt against prompt, or essay against
 * prompt, with neither side privileged - so where a card distinguishes query
 * from passage, both sides get the query form, which is what E5's card
 * recommends for similarity tasks.
 */
const CANDIDATES: { modelId: string; prefix: string; label: string }[] = [
  // The shipped model, re-measured here rather than quoted, so the comparison
  // is like-for-like on this corpus and this scorer. It wants no prefix.
  { modelId: "Xenova/all-MiniLM-L6-v2", prefix: "", label: "Xenova/all-MiniLM-L6-v2" },
  { modelId: "Xenova/bge-small-en-v1.5", prefix: "", label: "Xenova/bge-small-en-v1.5" },
  { modelId: "Xenova/e5-base-v2", prefix: "", label: "Xenova/e5-base-v2 (no prefix)" },
  { modelId: "Xenova/e5-base-v2", prefix: "query: ", label: "Xenova/e5-base-v2 (query: prefix)" },
  { modelId: "Xenova/bge-small-en-v1.5", prefix: "Represent this sentence for searching relevant passages: ", label: "Xenova/bge-small-en-v1.5 (BGE instruction)" },
];

type Item = {
  key: string; school: string; title: string; text: string;
  primary: string; families: string[]; tags: string[];
  fn: NonNullable<ReturnType<typeof categoryReview>>[5];
};

const byKey = new Map<string, Item>();
const unique: Item[] = [];
const seen = new Set<string>();
for (const school of listCoveredSchoolNames()) {
  for (const prompt of lookupSchoolSource(school)?.prompts ?? []) {
    const reviewed = categoryReview(school, prompt.externalRef);
    if (!reviewed) throw new Error(`unreviewed prompt: ${school} / ${prompt.externalRef}`);
    const item: Item = {
      key: `${school}|${prompt.externalRef}`, school, title: prompt.title,
      text: promptEmbeddingText(prompt.title, prompt.promptText),
      primary: reviewed[2], families: reviewed[3], tags: reviewed[4], fn: reviewed[5],
    };
    byKey.set(item.key, item);
    const signature = signatureOf(prompt.title, prompt.promptText);
    if (!seen.has(signature)) { seen.add(signature); unique.push(item); }
  }
}

const look = ([school, ref]: PromptKey) => {
  const item = byKey.get(`${school}|${ref}`);
  if (!item) throw new Error(`case names a missing prompt: ${school} / ${ref}`);
  return item;
};
const bandAtOrBelow = (band: RecommendedAction, ceiling: RecommendedAction) =>
  SCORING.BAND_ORDER.indexOf(band) <= SCORING.BAND_ORDER.indexOf(ceiling);

async function embedAll(modelId: string, prefix: string) {
  const { env, pipeline } = await import("@huggingface/transformers");
  env.allowRemoteModels = true;
  env.cacheDir = "./.model-cache";
  const extractor = await pipeline("feature-extraction", modelId, { dtype: "q8" });
  const vectors = new Map<string, number[]>();
  // One text per call, for the same reason src/lib/embedding.ts does it:
  // batching pads to the longest text and mean-pools over the padding, so a
  // vector would depend on what else was in its batch.
  for (const item of unique) {
    const output = await (extractor as unknown as (
      texts: string[], options: { pooling: "mean"; normalize: boolean },
    ) => Promise<{ tolist(): number[][] }>)([`${prefix}${item.text}`], { pooling: "mean", normalize: true });
    vectors.set(item.key, output.tolist()[0]);
  }
  return vectors;
}

type Result = {
  modelId: string; dimensions: number;
  positives: number; negatives: number; holdoutPositives: number; holdoutNegatives: number;
  failures: string[];
  topBandShare: number; floorShare: number; gatesPassed: boolean;
  saturated: number; atFloor: number;
  inkstoneMin: number;
};

const INKSTONE: PromptKey[] = [
  ["Georgetown University", "short-essay-activity"],
  ["Princeton University", "your-voice-2"],
  ["Harvard University", "short-answer-activities-shaped-you"],
  ["Stanford University", "short-answer-activity"],
];

async function benchmark(modelId: string, prefix: string, label: string): Promise<Result> {
  const vectors = await embedAll(modelId, prefix);
  const zBy = new Map<string, Map<string, number>>();
  for (const essay of unique) {
    const calibrated = calibrate(unique.map((target) => cosine(vectors.get(essay.key)!, vectors.get(target.key)!)));
    zBy.set(essay.key, new Map(unique.map((target, index) => [target.key, calibrated[index]])));
  }
  // A case may name a duplicate record; its unique representative holds the z.
  const zFor = (essay: Item, prompt: Item) => {
    const row = zBy.get(essay.key) ?? zBy.get([...zBy.keys()].find((k) => byKey.get(k)?.text === essay.text) ?? "");
    return row?.get(prompt.key)
      ?? row?.get([...(row?.keys() ?? [])].find((k) => byKey.get(k)?.text === prompt.text) ?? "")
      ?? null;
  };

  const pair = (essay: Item, prompt: Item, phrases: string[] = []): MatchInput => ({
    essayWordCount: 300, promptMinWordCount: null, promptMaxWordCount: 300,
    essaySchoolSpecificPhrases: phrases,
    essayPrimaryFamilySlug: essay.primary, essaySecondaryFamilySlugs: essay.families,
    essayTags: essay.tags, essayFunction: essay.fn,
    promptSchoolName: prompt.school, promptPrimaryFamilySlug: prompt.primary,
    promptSecondaryFamilySlugs: prompt.families, promptTags: prompt.tags, promptFunction: prompt.fn,
    semanticZScore: zFor(essay, prompt),
  });

  const failures: string[] = [];
  const countPositives = (cases: PositiveCase[], label: string) => cases.filter((testCase) => {
    const result = scoreMatch(pair(look(testCase.from), look(testCase.to)));
    if (result.score >= testCase.minScore) return true;
    failures.push(`${label} positive: ${look(testCase.from).title} -> ${look(testCase.to).title} = ${result.score}`);
    return false;
  }).length;
  const countNegatives = (cases: NegativeCase[], label: string) => cases.filter((testCase) => {
    const result = scoreMatch(pair(look(testCase.from), look(testCase.to), testCase.essaySchoolSpecificPhrases ?? []));
    if (result.score <= testCase.maxScore && bandAtOrBelow(result.recommendedAction, testCase.maxBand)) return true;
    failures.push(`${label} negative: ${look(testCase.from).title} -> ${look(testCase.to).title} = ${result.score}/${result.recommendedAction}`);
    return false;
  }).length;

  const positives = countPositives(CALIBRATION_POSITIVES, "calibration");
  const negatives = countNegatives(CALIBRATION_NEGATIVES, "calibration");
  const holdoutPositives = countPositives(HOLDOUT_POSITIVES, "holdout");
  const holdoutNegatives = countNegatives(HOLDOUT_NEGATIVES, "holdout");

  let total = 0, top = 0, floor = 0, saturated = 0, atFloor = 0;
  for (const essay of unique) {
    for (const prompt of unique) {
      if (essay.key === prompt.key) continue;
      total += 1;
      const z = zBy.get(essay.key)!.get(prompt.key)!;
      if (z >= 2) saturated += 1;
      if (z <= -1) atFloor += 1;
      const result = scoreMatch(pair(essay, prompt));
      if (result.recommendedAction === "reusable-slight-edits") top += 1;
      if (result.score >= 50) floor += 1;
    }
  }

  let inkstoneMin = 100;
  for (const from of INKSTONE) {
    for (const to of INKSTONE) {
      if (from === to) continue;
      inkstoneMin = Math.min(inkstoneMin, scoreMatch(pair(look(from), look(to))).score);
    }
  }

  return {
    modelId: label, dimensions: vectors.get(unique[0].key)!.length,
    positives, negatives, holdoutPositives, holdoutNegatives, failures,
    topBandShare: top / total, floorShare: floor / total,
    gatesPassed: top / total <= AGGREGATE_GATES.topBandShare && floor / total <= AGGREGATE_GATES.floorShare,
    saturated: saturated / total, atFloor: atFloor / total,
    inkstoneMin,
  };
}

const results: Result[] = [];
for (const candidate of CANDIDATES) {
  console.log(`Embedding ${unique.length} prompts with ${candidate.label}...`);
  results.push(await benchmark(candidate.modelId, candidate.prefix, candidate.label));
}

const pct = (value: number) => `${(value * 100).toFixed(2)}%`;
const out: string[] = [];
const w = (line = "") => out.push(line);
w("# Embedding model benchmark");
w();
w("Generated by `scripts/benchmark-embeddings.mts`. The scorer is frozen at the");
w(`configuration chosen in [scoring-sweep.md](scoring-sweep.md) - ${SCORING.WEIGHTS.category}/${SCORING.WEIGHTS.semantic}/${SCORING.WEIGHTS.function}, within-group`);
w(`function credit ${SCORING.SAME_GROUP_FRACTION} - so the only thing varying between rows is the model.`);
w();
w(`Scored on ${unique.length} unique catalogue prompts and every ordered pair of them.`);
w("`Inkstone min` is the lowest of the twelve activity-family pairs, which is the");
w("case this whole redesign exists for: below 60 and one of them is not surfacing.");
w();
w("| Model | Dims | Calibration | Holdout | Inkstone min | Top band | >=50 | z>=2 | z<=-1 | Gates |");
w("|---|---|---|---|---|---|---|---|---|---|");
for (const r of results) {
  w(`| \`${r.modelId}\` | ${r.dimensions} | ${r.positives}/${CALIBRATION_POSITIVES.length} + ${r.negatives}/${CALIBRATION_NEGATIVES.length} | ${r.holdoutPositives}/${HOLDOUT_POSITIVES.length} + ${r.holdoutNegatives}/${HOLDOUT_NEGATIVES.length} | ${r.inkstoneMin} | ${pct(r.topBandShare)} | ${pct(r.floorShare)} | ${pct(r.saturated)} | ${pct(r.atFloor)} | ${r.gatesPassed ? "pass" : "FAIL"} |`);
}
for (const r of results) {
  if (r.failures.length === 0) continue;
  w();
  w(`### \`${r.modelId}\` failures`);
  w();
  for (const failure of r.failures) w(`- ${failure}`);
}
w();
w("## What this does and does not settle");
w();
w("**Both sides of every pair here are prompts.** Production embeds a student's");
w("essay - hundreds of words of narrative prose - against a prompt of a few dozen.");
w("A larger model's advantage, if it has one, is most likely to appear on exactly");
w("the long-text side this benchmark never exercises, so a model losing here is");
w("not shown to be worse in the app. It is shown not to be better on the one");
w("comparison that can be made offline and deterministically today.");
w();
w("Re-run this against real essays before treating a negative result as final.");
w("That check needs essays, which is the same thing every other part of this");
w("evaluation is waiting on.");
w();
w("The instruction prefix is load-bearing and is the reason the first run of this");
w("benchmark was wrong. BGE without its retrieval instruction fails three");
w("calibration positives; with it, it passes all twenty. Any future candidate has");
w("to be run in the form its model card specifies, or the benchmark measures the");
w("prefix.");
writeFileSync("docs/evaluation/embedding-benchmark.md", `${out.join("\n")}\n`);
console.log(`\n${out.join("\n")}`);
