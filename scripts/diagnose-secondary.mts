/**
 * Why does the secondary-category factor average 1.4 of 20?
 *
 * Writes docs/evaluation/secondary-diagnosis.md. A low average is a reason to
 * look, not evidence of a fault: two prompts sharing a specific sub-theme may
 * simply be uncommon. This separates the candidate causes - too few tags, tags
 * too narrow or too broad, essay and prompt vocabularies not meeting, or the
 * scoring - and asks whether the factor earns its place by catching
 * relationships the semantic factor misses.
 *
 *   node --experimental-strip-types --import ./scripts/ts-resolve.mjs scripts/diagnose-secondary.mts
 */
import { writeFileSync } from "node:fs";

import { classifyText } from "../src/lib/classification.ts";
import { cosine, decodeVector } from "../src/lib/embedding.ts";
import { DEMO_ESSAYS } from "../src/lib/db/demo-workspace.ts";
import { categoryReview } from "../src/lib/retrieval/category-review.ts";
import { PROMPT_VECTORS } from "../src/lib/retrieval/prompt-vectors.ts";
import { listCoveredSchoolNames, lookupSchoolSource } from "../src/lib/retrieval/registry.ts";
import { SECONDARY_TAGS } from "../src/lib/db/taxonomy.ts";
import { essayEmbeddingText } from "../src/lib/semantic.ts";

const vectorByKey = new Map(PROMPT_VECTORS.map(([school, ref, encoded]) => [`${school}|${ref}`, decodeVector(encoded)]));
type P = { school: string; ref: string; title: string; primary: string; signals: string[]; vector?: number[] };
const prompts: P[] = [];
for (const school of listCoveredSchoolNames()) {
  for (const prompt of lookupSchoolSource(school)?.prompts ?? []) {
    const r = categoryReview(school, prompt.externalRef)!;
    prompts.push({
      school, ref: prompt.externalRef, title: prompt.title, primary: r[2],
      signals: [...r[3], ...r[4]],
      vector: vectorByKey.get(`${school}|${prompt.externalRef}`),
    });
  }
}

// Essay side: the demo essays are the only realistic prose in the repo, and
// their signals are derived exactly as reuse.ts derives them.
type E = { title: string; family: string; signals: string[] };
const essays: E[] = DEMO_ESSAYS.map((essay) => {
  const derived = classifyText(essayEmbeddingText(essay.title, essay.content));
  return { title: essay.title, family: essay.family, signals: [...new Set([...derived.secondarySlugs, ...derived.tags])] };
});

const pct = (n: number, d: number) => `${((n / Math.max(d, 1)) * 100).toFixed(1)}%`;
const out: string[] = [];
const w = (line = "") => out.push(line);

w("# Diagnosis: the secondary-category factor");
w();
w("It averages 1.4 of 20 across the catalogue cross-product and sits at its floor");
w("on 82% of pairs. This asks whether that is a fault or the expected value of");
w("measuring something genuinely uncommon.");
w();
w("## Supply: are there enough tags to match on?");
w();
const withSignals = prompts.filter((p) => p.signals.length > 0);
const perPrompt = prompts.reduce((sum, p) => sum + p.signals.length, 0) / prompts.length;
const essaysWithSignals = essays.filter((e) => e.signals.length > 0);
const perEssay = essays.reduce((sum, e) => sum + e.signals.length, 0) / essays.length;
w("| | Prompts | Essays (demo) |");
w("|---|---|---|");
w(`| Count | ${prompts.length} | ${essays.length} |`);
w(`| With at least one secondary | ${withSignals.length} (${pct(withSignals.length, prompts.length)}) | ${essaysWithSignals.length} (${pct(essaysWithSignals.length, essays.length)}) |`);
w(`| Mean secondaries each | ${perPrompt.toFixed(2)} | ${perEssay.toFixed(2)} |`);
w(`| Vocabulary size | 17 (review) | ${new Set(essays.flatMap((e) => e.signals)).size} distinct emitted |`);
w();
w("Distribution of secondaries per prompt:");
w();
const histogram = new Map<number, number>();
for (const p of prompts) histogram.set(p.signals.length, (histogram.get(p.signals.length) ?? 0) + 1);
w("| Secondaries | Prompts |");
w("|---|---|");
for (const [count, n] of [...histogram].sort((a, b) => a[0] - b[0])) w(`| ${count} | ${n} (${pct(n, prompts.length)}) |`);
w();
w("## Are individual tags too broad or too narrow?");
w();
w("A tag on almost every prompt cannot discriminate; a tag on one or two prompts");
w("can almost never be shared.");
w();
const tagCounts = new Map<string, number>();
for (const p of prompts) for (const s of p.signals) tagCounts.set(s, (tagCounts.get(s) ?? 0) + 1);
w("| Secondary | Prompts | Share | Essays using it |");
w("|---|---|---|---|");
for (const [tag, n] of [...tagCounts].sort((a, b) => b[1] - a[1])) {
  const inEssays = essays.filter((e) => e.signals.includes(tag)).length;
  w(`| ${tag} | ${n} | ${pct(n, prompts.length)} | ${inEssays} |`);
}
const unused = SECONDARY_TAGS.filter((tag) => !tagCounts.has(tag));
w();
w(`Seeded tag names never used by the review: ${unused.length} of ${SECONDARY_TAGS.length} — ${unused.join(", ")}.`);
w();
w("## Do the two sides share a vocabulary in practice?");
w();
const essaySignalSet = new Set(essays.flatMap((e) => e.signals));
const promptSignalSet = new Set(prompts.flatMap((p) => p.signals));
const onlyPrompts = [...promptSignalSet].filter((s) => !essaySignalSet.has(s));
const onlyEssays = [...essaySignalSet].filter((s) => !promptSignalSet.has(s));
w(`- Secondaries the review assigns to prompts: ${promptSignalSet.size}`);
w(`- Secondaries the classifier derives from the demo essays: ${essaySignalSet.size}`);
w(`- Assigned to prompts but never derived from an essay: **${onlyPrompts.length}** — ${onlyPrompts.join(", ") || "none"}`);
w(`- Derived from essays but never assigned to a prompt: ${onlyEssays.length} — ${onlyEssays.join(", ") || "none"}`);
w();
w("## Expected overlap if the tags were assigned independently");
w();
w("The baseline that decides whether 82%-at-floor is surprising. If two prompts");
w("draw their secondaries independently from the observed distribution, the chance");
w("they share at least one is:");
w();
const totalAssignments = [...tagCounts.values()].reduce((a, b) => a + b, 0);
const probs = [...tagCounts.values()].map((n) => n / prompts.length);
const pNoShare = probs.reduce((acc, p) => acc * (1 - p * p), 1);
w(`- ${totalAssignments} tag assignments over ${prompts.length} prompts`);
w(`- P(share at least one) ≈ **${pct(1 - pNoShare, 1)}**`);
w(`- Measured across all ${(prompts.length * prompts.length).toLocaleString()} pairs: see below`);
w();
let sharePairs = 0;
let total = 0;
for (const a of prompts) for (const b of prompts) { total += 1; if (a.signals.some((s) => b.signals.includes(s))) sharePairs += 1; }
w(`Measured: **${pct(sharePairs, total)}** of pairs share at least one secondary.`);
w();

w("## Does it catch anything the semantic factor misses?");
w();
w("This is the question that decides whether the factor earns 20 points. For each");
w("prompt pair sharing a secondary, how similar are they semantically? A pair that");
w("shares a theme *and* is semantically distant is a relationship only this factor");
w("can see - which is the whole argument for having it.");
w();
const shared: { a: P; b: P; z: number }[] = [];
const notShared: number[] = [];
for (const a of prompts) {
  if (!a.vector) continue;
  for (const b of prompts) {
    if (!b.vector || a.ref === b.ref || a.title === b.title) continue;
    const sim = cosine(a.vector, b.vector);
    if (a.signals.some((s) => b.signals.includes(s))) shared.push({ a, b, z: sim });
    else notShared.push(sim);
  }
}
const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / Math.max(xs.length, 1);
w(`- Mean similarity, pairs sharing a secondary: **${mean(shared.map((s) => s.z)).toFixed(3)}** (${shared.length.toLocaleString()} pairs)`);
w(`- Mean similarity, pairs sharing none: **${mean(notShared).toFixed(3)}** (${notShared.length.toLocaleString()} pairs)`);
w();
const distantButShared = shared.filter((s) => s.z < 0.15).sort((a, b) => a.z - b.z);
w(`**${distantButShared.length.toLocaleString()}** pairs share a secondary while being semantically distant (cosine < 0.15).`);
w("These are the ones the factor exists for:");
w();
w("| Similarity | Shared | Prompt A | Prompt B |");
w("|---|---|---|---|");
for (const s of distantButShared.slice(0, 10)) {
  const overlap = s.a.signals.filter((x) => s.b.signals.includes(x)).join(", ");
  w(`| ${s.z.toFixed(3)} | ${overlap} | ${s.a.title} | ${s.b.title} |`);
}
w();
w("And the failure mode, where a shared tag links prompts that are not alike:");
w();
w("| Similarity | Shared | Prompt A | Prompt B |");
w("|---|---|---|---|");
for (const s of distantButShared.slice(0, 40).filter((_, i) => i % 8 === 0).slice(0, 5)) {
  const overlap = s.a.signals.filter((x) => s.b.signals.includes(x)).join(", ");
  w(`| ${s.z.toFixed(3)} | ${overlap} | ${s.a.title} | ${s.b.title} |`);
}
w();
w("## Obviously related pairs that share no secondary");
w();
w("Same primary category and semantically close, yet no shared secondary - the");
w("factor contributing nothing where a person would expect it to.");
w();
const missed = [] as { a: P; b: P; z: number }[];
for (const a of prompts) {
  if (!a.vector) continue;
  for (const b of prompts) {
    if (!b.vector || a.ref === b.ref || a.title === b.title) continue;
    if (a.primary !== b.primary || a.primary === "other") continue;
    if (cosine(a.vector, b.vector) < 0.45) continue;
    if (!a.signals.some((s) => b.signals.includes(s))) missed.push({ a, b, z: cosine(a.vector, b.vector) });
  }
}
w(`**${missed.length.toLocaleString()}** such pairs. A sample:`);
w();
w("| Similarity | Category | Prompt A (secondaries) | Prompt B (secondaries) |");
w("|---|---|---|---|");
for (const m of missed.sort((a, b) => b.z - a.z).slice(0, 10)) {
  w(`| ${m.z.toFixed(3)} | ${m.a.primary} | ${m.a.title} (${m.a.signals.join(", ") || "none"}) | ${m.b.title} (${m.b.signals.join(", ") || "none"}) |`);
}
w();

writeFileSync("docs/evaluation/secondary-diagnosis.md", out.join("\n") + "\n");
console.log("Wrote docs/evaluation/secondary-diagnosis.md");
