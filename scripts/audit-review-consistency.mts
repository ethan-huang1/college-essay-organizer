/**
 * Surfaces classification decisions worth re-reading. A worklist, not a rule.
 *
 * Four checks, and the fourth is the one this script exists for:
 *
 * 1. **`Other` census.** `Other` earns the neutral rung on the category ladder
 *    rather than a match, so a prompt filed there that has a real category is a
 *    prompt that will never surface a reuse opportunity it deserves. Lists every
 *    one for a second reading.
 * 2. **Secondary counts.** Zero secondaries on a prompt with obvious overlap,
 *    or five on a prompt with one intent, are both worth a look.
 * 3. **Vocabulary use.** A category or tag nobody ever assigns cannot
 *    discriminate; one assigned to almost everything cannot either.
 * 4. **Near-duplicate disagreement.** Prompts above a cosine threshold that got
 *    different primaries or functions. Inconsistent labelling of prompts that
 *    say nearly the same thing is the error most likely to survive a
 *    row-by-row read, because the rows are hundreds of lines apart.
 *
 * **Nothing here is an assertion, and it must not become one.** Highly similar
 * prompts can legitimately differ: "describe an activity" and "reflect on why an
 * activity mattered" are near neighbours in embedding space and are genuinely
 * different requests, and Brown's "Why medicine?" and "Why PLME?" are the most
 * similar pair in the entire corpus while needing opposite categories. Forcing a
 * cluster to agree would destroy exactly the distinctions the scoring depends
 * on. This prints; a person decides.
 *
 *   node --experimental-strip-types --import ./scripts/ts-resolve.mjs \
 *     scripts/audit-review-consistency.mts [threshold]
 */
import { readFileSync } from "node:fs";

import { cosine, decodeVector } from "../src/lib/embedding.ts";
import { PROMPT_VECTORS } from "../src/lib/retrieval/prompt-vectors.ts";
import { parseCsv } from "./parse-csv.mts";
import { splitSecondaries } from "./review-vocabulary.mts";

const THRESHOLD = Number(process.argv[2] ?? 0.75);
const rows = parseCsv(readFileSync("docs/evaluation/prompt-review.csv", "utf8"));
const vectorByKey = new Map(PROMPT_VECTORS.map(([school, ref, encoded]) => [`${school}|${ref}`, decodeVector(encoded)]));

const items = rows.map((row) => ({
  id: row.ID,
  school: row.School,
  title: row["Prompt title"],
  primary: row["Final primary"],
  secondaries: splitSecondaries(row["Final secondaries"] ?? ""),
  fn: row["Final function"],
  why: row.Why,
  vector: vectorByKey.get(`${row.School}|${row["External ref"]}`),
}));

console.log(`${items.length} unique prompts.\n`);

// 1. Other census.
const others = items.filter((item) => item.primary === "Other");
console.log(`## 1. Filed as Other: ${others.length} of ${items.length} (${((others.length / items.length) * 100).toFixed(1)}%)\n`);
for (const item of others) console.log(`  #${item.id} [${item.school}] ${item.title}\n        ${item.why}`);

// 2. Secondary counts.
const histogram = new Map<number, number>();
for (const item of items) histogram.set(item.secondaries.length, (histogram.get(item.secondaries.length) ?? 0) + 1);
console.log(`\n## 2. Secondaries per prompt\n`);
for (const [n, count] of [...histogram].sort((a, b) => a[0] - b[0])) console.log(`  ${n}: ${count}`);
const bare = items.filter((item) => item.secondaries.length === 0);
console.log(`\n  no secondaries at all (${bare.length}):`);
for (const item of bare) console.log(`    #${item.id} ${item.primary.padEnd(22)} [${item.school}] ${item.title}`);

// 3. Vocabulary use.
console.log(`\n## 3. Vocabulary use\n`);
const primaryCount = new Map<string, number>();
const secondaryCount = new Map<string, number>();
const fnCount = new Map<string, number>();
for (const item of items) {
  primaryCount.set(item.primary, (primaryCount.get(item.primary) ?? 0) + 1);
  fnCount.set(item.fn, (fnCount.get(item.fn) ?? 0) + 1);
  for (const secondary of item.secondaries) secondaryCount.set(secondary, (secondaryCount.get(secondary) ?? 0) + 1);
}
const table = (label: string, counts: Map<string, number>) => {
  console.log(`  ${label}`);
  for (const [name, n] of [...counts].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${String(n).padStart(3)}  ${((n / items.length) * 100).toFixed(1).padStart(4)}%  ${name}`);
  }
};
table("primary:", primaryCount);
table("secondary:", secondaryCount);
table("function:", fnCount);

// 4. Near-duplicate disagreement.
console.log(`\n## 4. Near-duplicate prompts (cosine > ${THRESHOLD}) that were classified differently\n`);
const withVectors = items.filter((item): item is typeof item & { vector: number[] } => Boolean(item.vector));
let flagged = 0;
for (let i = 0; i < withVectors.length; i += 1) {
  for (let j = i + 1; j < withVectors.length; j += 1) {
    const a = withVectors[i];
    const b = withVectors[j];
    const similarity = cosine(a.vector, b.vector);
    if (similarity <= THRESHOLD) continue;
    const primaryDiffers = a.primary !== b.primary;
    const fnDiffers = a.fn !== b.fn;
    // Secondaries too. The first version of this check compared only primary
    // and function, and missed the case that matters most for near-identical
    // prompts: Brown and Princeton both ask "what brings you joy", agree on
    // primary and function, and one carried a `Values` secondary while the
    // other carried none. With the category ladder reading secondaries, that
    // difference decided whether the pair surfaced at all - and no assertion
    // anywhere would have caught it.
    const secondaryDiffers = [...a.secondaries].sort().join("|") !== [...b.secondaries].sort().join("|");
    if (!primaryDiffers && !fnDiffers && !secondaryDiffers) continue;
    flagged += 1;
    const what = [primaryDiffers ? "primary" : null, fnDiffers ? "function" : null, secondaryDiffers ? "secondaries" : null].filter(Boolean).join(" + ");
    console.log(`  cos=${similarity.toFixed(3)}  differs on ${what}`);
    console.log(`    #${a.id} ${a.primary} / ${a.fn} / ${a.secondaries.join("; ") || "-"}  [${a.school}] ${a.title}`);
    console.log(`    #${b.id} ${b.primary} / ${b.fn} / ${b.secondaries.join("; ") || "-"}  [${b.school}] ${b.title}`);
  }
}
console.log(`\n  ${flagged} pair(s) flagged for re-reading. Not a failure: near-duplicate prompts may legitimately differ.`);
