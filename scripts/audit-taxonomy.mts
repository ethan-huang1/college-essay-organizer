/**
 * Two audits over committed data: whether `Other` hides coherent essay families,
 * and whether the secondary-category factor is underperforming or merely
 * measuring something genuinely uncommon.
 *
 * Writes docs/evaluation/other-audit.md and docs/evaluation/secondary-diagnosis.md.
 *
 * The cluster assignments below are mine, made by reading all 94 `Other` prompts
 * (laid out in other-prompts.md). This script exists to *test* them: a cluster
 * whose members do not resemble each other more than they resemble the rest of
 * the catalogue is a label I invented, not a family that is there.
 *
 *   node --experimental-strip-types --import ./scripts/ts-resolve.mjs scripts/audit-taxonomy.mts
 */
import { writeFileSync } from "node:fs";

import { cosine, decodeVector } from "../src/lib/embedding.ts";
import { categoryReview } from "../src/lib/retrieval/category-review.ts";
import { PROMPT_VECTORS } from "../src/lib/retrieval/prompt-vectors.ts";
import { listCoveredSchoolNames, lookupSchoolSource } from "../src/lib/retrieval/registry.ts";

type Prompt = {
  school: string; ref: string; title: string; text: string;
  primary: string; families: string[]; tags: string[]; fn: string;
  min?: number | null; max?: number | null;
  vector: number[] | undefined;
};

const vectorByKey = new Map(PROMPT_VECTORS.map(([school, ref, encoded]) => [`${school}|${ref}`, decodeVector(encoded)]));
const all: Prompt[] = [];
for (const school of listCoveredSchoolNames()) {
  for (const prompt of lookupSchoolSource(school)?.prompts ?? []) {
    const reviewed = categoryReview(school, prompt.externalRef)!;
    all.push({
      school, ref: prompt.externalRef, title: prompt.title,
      text: prompt.promptText.replace(/\s+/g, " ").trim(),
      primary: reviewed[2], families: reviewed[3], tags: reviewed[4], fn: reviewed[5],
      min: prompt.minWordCount ?? null, max: prompt.maxWordCount ?? null,
      vector: vectorByKey.get(`${school}|${prompt.externalRef}`),
    });
  }
}
const others = all.filter((p) => p.primary === "other");

/**
 * Proposed clusters, by prompt title. A title can appear once only - where a
 * prompt could sit in two clusters the exclusion rule that decided it is stated
 * in the report.
 */
const CLUSTERS: { name: string; titles: string[] }[] = [
  {
    name: "Activities & Impact",
    titles: [
      "PIQ 1: Leadership experience", "PIQ 3: Greatest talent or skill", "PIQ 7: Made your community a better place",
      "A life of purpose", "University Honors: curiosity in action", "Engaging with a Pitzer core value",
      "Advancing equity and justice", "Make a space more welcoming", "Service to others",
      "Someone borrowing your strength", "Turn ideas into actions", "Life outside school",
      "Activities, employment, travel, or family responsibilities", "An extracurricular, job, or responsibility",
      "Most significant activity", "Proudest activity", "Your Voice: service and civic engagement",
      "Leaders and citizens",
    ],
  },
  {
    name: "Intellectual Curiosity",
    titles: [
      "What excites you?", "Celebrate your nerdy side", "A topic you could talk about for hours",
      "Option A: Curiosity", "Teach a class", "A favorite school assignment", "Insight from reading",
      "Johnson Scholarship: a work of art", "A meaningful conversation partner", "The luxury of focus",
      "Johnson Scholarship: design a Spring Term course", "A Paideia class", "An interdisciplinary project",
      "Generalist or specialist",
    ],
  },
  {
    name: "Values & Beliefs",
    titles: [
      "What would you fight for?", "Faith and decisions", "A lesson in life", "A Maya Angelou quote",
      "The Offer of the College", "A fourth 'Be'", "Someone you admire", "Thank-you note",
      "Significant challenge society faces", "Technology and the common good",
    ],
  },
  {
    name: "Creativity & Making",
    titles: [
      "PIQ 2: Creative side", "A specific portfolio piece", "An engineering or science project",
      "Scientific Drive: Making", "M&T: Something you built", "BA+BFA: artistic influences",
    ],
  },
  {
    name: "Additional Information",
    titles: [
      "PIQ 8: What makes you a strong candidate", "Optional Academic Context", "What you want to emphasize",
    ],
  },
];

const clusterOf = new Map<string, string>();
for (const cluster of CLUSTERS) for (const title of cluster.titles) clusterOf.set(title, cluster.name);
const residual = others.filter((p) => !clusterOf.has(p.title));

/** Mean pairwise cosine within a set, and between that set and everything else. */
function cohesion(members: Prompt[], universe: Prompt[]) {
  const withVectors = members.filter((p) => p.vector);
  let inside = 0, insideCount = 0;
  for (let i = 0; i < withVectors.length; i += 1) {
    for (let j = i + 1; j < withVectors.length; j += 1) {
      // Skip identical prompts repeated across UC campuses: they would report
      // cohesion 1.0 and say nothing about whether the family is real.
      if (withVectors[i].title === withVectors[j].title) continue;
      inside += cosine(withVectors[i].vector!, withVectors[j].vector!);
      insideCount += 1;
    }
  }
  const outsiders = universe.filter((p) => p.vector && !members.includes(p));
  let outside = 0, outsideCount = 0;
  for (const member of withVectors) {
    for (const other of outsiders) {
      outside += cosine(member.vector!, other.vector!);
      outsideCount += 1;
    }
  }
  return {
    inside: insideCount ? inside / insideCount : 0,
    outside: outsideCount ? outside / outsideCount : 0,
    pairs: insideCount,
  };
}

const pct = (n: number, d: number) => `${((n / d) * 100).toFixed(1)}%`;
const out: string[] = [];
const w = (line = "") => out.push(line);

w("# Audit: is `Other` one category or several?");
w();
w("> **Read [reconciliation.md](reconciliation.md) first.** All 255 reviewed prompts");
w("> carry exactly the primary and secondary assignments the owner's review gives");
w("> them — 0 mismatches — so `Other` being 37% of the catalogue is what the review");
w("> says, not a wiring failure. In particular **Activities & Impact and Creativity");
w("> appear 0 times as a primary in the review** and 24 and 19 times as");
w("> secondaries, exactly as stored. Nothing below is a restoration of a lost");
w("> category; every proposal here would be a new one, and needs a product");
w("> decision rather than a bug fix.");
w(">");
w("> **Since that reconciliation, Activities & Impact has been promoted to a");
w("> primary category** by owner decision — 8 review rows, 14 catalogue records —");
w("> so `Other` is now 80 of 255 (31.4%) rather than 94 (36.9%). The proposal");
w("> tables below are regenerated against the new taxonomy, so the");
w("> Activities & Impact row now measures only what is *left* in `Other`.");
w();
w(`\`Other\` holds **${others.length} of ${all.length}** catalogue prompts (${pct(others.length, all.length)}) and is the least`);
w("reusable category in the evaluation. Every one of them was read; this report");
w("tests whether the families I found in them are real or invented.");
w();
w("## The test applied to each proposal");
w();
w("A cluster is only worth a category if its members resemble each other more than");
w("they resemble the catalogue at large. `inside` is the mean pairwise similarity");
w("within the cluster, `outside` the mean similarity between its members and every");
w("other prompt. Prompts repeated verbatim across UC campuses are excluded from");
w("`inside`, since seven copies of one prompt would report near-1.0 cohesion and");
w("prove nothing.");
w();
w("| Proposed category | Prompts | % of `Other` | % of catalogue | inside | outside | ratio |");
w("|---|---|---|---|---|---|---|");
const rows: { name: string; members: Prompt[]; c: ReturnType<typeof cohesion> }[] = [];
for (const cluster of CLUSTERS) {
  const members = others.filter((p) => clusterOf.get(p.title) === cluster.name);
  const c = cohesion(members, all);
  rows.push({ name: cluster.name, members, c });
  w(`| ${cluster.name} | ${members.length} | ${pct(members.length, others.length)} | ${pct(members.length, all.length)} | ${c.inside.toFixed(3)} | ${c.outside.toFixed(3)} | **${(c.inside / c.outside).toFixed(2)}×** |`);
}
const residualCohesion = cohesion(residual, all);
w(`| _residual \`Other\`_ | ${residual.length} | ${pct(residual.length, others.length)} | ${pct(residual.length, all.length)} | ${residualCohesion.inside.toFixed(3)} | ${residualCohesion.outside.toFixed(3)} | ${(residualCohesion.inside / residualCohesion.outside).toFixed(2)}× |`);
w();
w("For reference, the same measure on the existing primary categories, which are");
w("the bar a new category should clear:");
w();
w("| Existing category | Prompts | inside | outside | ratio |");
w("|---|---|---|---|---|");
for (const slug of ["community", "diversity", "challenge-growth", "activities-impact", "why-major", "why-us", "shorts", "roommate"]) {
  const members = all.filter((p) => p.primary === slug);
  if (members.length < 2) continue;
  const c = cohesion(members, all);
  w(`| ${slug} | ${members.length} | ${c.inside.toFixed(3)} | ${c.outside.toFixed(3)} | ${(c.inside / c.outside).toFixed(2)}× |`);
}
w();

for (const { name, members, c } of rows) {
  w(`## ${name}`);
  w();
  w(`${members.length} prompts, ${pct(members.length, others.length)} of \`Other\`, across ${new Set(members.map((m) => m.school)).size} schools.`);
  w(`Cohesion ${c.inside.toFixed(3)} inside against ${c.outside.toFixed(3)} outside (${(c.inside / c.outside).toFixed(2)}×).`);
  w();
  w("| Prompt | School | Function | Secondaries |");
  w("|---|---|---|---|");
  const seen = new Set<string>();
  for (const m of members) {
    if (seen.has(m.title)) continue;
    seen.add(m.title);
    const copies = members.filter((x) => x.title === m.title).length;
    w(`| ${m.title}${copies > 1 ? ` _(×${copies})_` : ""} | ${copies > 1 ? "UC systemwide" : m.school} | ${m.fn} | ${[...m.families, ...m.tags].join(", ") || "—"} |`);
  }
  w();
}

w("## Residual `Other`");
w();
w(`${residual.length} prompts, ${pct(residual.length, others.length)} of \`Other\`, cohesion ${residualCohesion.inside.toFixed(3)} against ${residualCohesion.outside.toFixed(3)}.`);
w();
w("| Prompt | School | Function | Why it stays |");
w("|---|---|---|---|");
for (const m of residual) {
  w(`| ${m.title} | ${m.school} | ${m.fn} | |`);
}
w();
const absorbed = others.length - residual.length;
w("## If all five were adopted");
w();
w(`- \`Other\` would absorb out **${absorbed} of ${others.length}** prompts (${pct(absorbed, others.length)}).`);
w(`- \`Other\` would fall from ${pct(others.length, all.length)} of the catalogue to **${pct(residual.length, all.length)}**.`);
w(`- The taxonomy would grow from 10 primaries to ${10 + CLUSTERS.length}.`);
w();

w("## Would a new category actually improve recommendations?");
w();
w("Cohesion says a family exists; it does not say adopting it helps. Promoting a");
w("cluster to a primary category gives its member pairs the 25-point primary");
w("factor they currently score zero on. This counts how many pairs inside each");
w("cluster are close enough that those 25 points would carry them over a band");
w("boundary - the only mechanism by which a taxonomy change improves advice.");
w();
w("Scored exactly as matching.ts would, but with the cluster as a shared primary.");
w("Pairs of prompts repeated across UC campuses are excluded.");
w();
const { SCORING } = await import("../src/lib/matching.ts");
void SCORING;
const { scoreMatch } = await import("../src/lib/matching.ts");
const { calibrate } = await import("../src/lib/embedding.ts");

// Calibrate each cluster member against the whole catalogue, as reuse.ts does.
const zFor = new Map<string, Map<string, number>>();
for (const p of all) {
  if (!p.vector) continue;
  const targets = all.filter((t) => t.vector);
  const cal = calibrate(targets.map((t) => cosine(p.vector!, t.vector!)));
  zFor.set(p.ref, new Map(targets.map((t, i) => [t.ref, cal[i]])));
}
const scoreAs = (essay: Prompt, prompt: Prompt, sharedPrimary: boolean) => scoreMatch({
  essayWordCount: prompt.max ?? 300,
  essayPrimaryFamilySlug: sharedPrimary ? "shared" : essay.primary,
  essaySecondaryFamilySlugs: essay.families,
  essayTags: essay.tags,
  essaySchoolSpecificPhrases: [],
  essayFunction: essay.fn as never,
  promptSchoolName: prompt.school,
  promptPrimaryFamilySlug: sharedPrimary ? "shared" : prompt.primary,
  promptSecondaryFamilySlugs: prompt.families,
  promptTags: prompt.tags,
  promptFunction: prompt.fn as never,
  promptMinWordCount: prompt.min ?? null,
  promptMaxWordCount: prompt.max ?? null,
  semanticZScore: zFor.get(essay.ref)?.get(prompt.ref) ?? null,
}).score;

w("| Proposed category | Distinct pairs | Cross 50 | Cross 60 | Cross 70 |");
w("|---|---|---|---|---|");
for (const { name, members } of rows) {
  const distinct = members.filter((m, i) => members.findIndex((x) => x.title === m.title) === i);
  let pairs = 0, c50 = 0, c60 = 0, c70 = 0;
  for (let i = 0; i < distinct.length; i += 1) {
    for (let j = 0; j < distinct.length; j += 1) {
      if (i === j) continue;
      pairs += 1;
      const before = scoreAs(distinct[i], distinct[j], false);
      const after = scoreAs(distinct[i], distinct[j], true);
      if (before < 50 && after >= 50) c50 += 1;
      if (before < 60 && after >= 60) c60 += 1;
      if (before < 70 && after >= 70) c70 += 1;
    }
  }
  w(`| ${name} | ${pairs} | ${c50} (${pct(c50, pairs)}) | ${c60} (${pct(c60, pairs)}) | ${c70} (${pct(c70, pairs)}) |`);
}
w();

writeFileSync("docs/evaluation/other-audit.md", out.join("\n") + "\n");
console.log(`Wrote docs/evaluation/other-audit.md`);
