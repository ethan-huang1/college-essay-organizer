/**
 * Reconciles the product owner's manual category review against everything
 * downstream of it: the committed review data, the seeded taxonomy, and the
 * classifications the import path actually writes.
 *
 * Exists because a diagnostic is only as good as its inputs. If the review says
 * one thing and the imported catalogue another, every measurement taken since is
 * describing the wrong corpus.
 *
 * docs/evaluation/source-review.tsv is the transcription of the owner's CSV
 * (school, title, primary, secondaries, function) and is treated here as the
 * source of truth.
 *
 *   node --experimental-strip-types --import ./scripts/ts-resolve.mjs scripts/reconcile-review.mts
 */
import { readFileSync, writeFileSync } from "node:fs";

import { PROMPT_FAMILIES, SECONDARY_TAGS } from "../src/lib/db/taxonomy.ts";
import { categoryReview } from "../src/lib/retrieval/category-review.ts";
import { listCoveredSchoolNames, lookupSchoolSource } from "../src/lib/retrieval/registry.ts";

// The mappings the import applies, restated here independently so a change to
// them shows up as a difference rather than being silently mirrored.
const PRIMARY_TO_SLUG: Record<string, string> = {
  "Community": "community", "Background & Identity": "diversity", "Why Us": "why-us",
  "Why Major": "why-major", "Challenge & Growth": "challenge-growth",
  "Activities & Impact": "activities-impact",
  "Personal Statement": "personal-statement", "Short Answer": "shorts",
  "Other": "other", "Reading List": "reading-list", "Roommate": "roommate",
};
const SECONDARY_TO_STORED: Record<string, string> = {
  "Academic Context": "academic context", "Activities & Impact": "activities-impact",
  "Background & Identity": "diversity", "Challenge & Growth": "challenge-growth",
  "Collaboration": "collaboration", "Community": "community", "Contribution": "contribution",
  "Course": "course", "Creativity": "creativity", "Disagreement": "disagreement",
  "Goals & Future": "goals & future", "Intellectual Curiosity": "intellectual curiosity",
  "Leadership": "leadership", "Service": "service", "Values": "values & meaning",
  "Why Major": "why-major", "Why Us": "why-us",
};

type Row = { school: string; title: string; primary: string; secondaries: string[] };

/** Minimal RFC4180 reader: the review's prompt text contains commas and quotes. */
function parseCsv(text: string): Record<string, string>[] {
  const table: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n") { row.push(field); table.push(row); row = []; field = ""; }
    else if (ch !== "\r") field += ch;
  }
  if (field || row.length) { row.push(field); table.push(row); }
  const header = table.shift()!.map((h) => h.replace(/^\ufeff/, "").trim());
  return table.filter((r) => r.some((c) => c.trim()))
    .map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? "").trim()])));
}

// The owner's file, byte-for-byte. Override columns win where filled, which is
// how a classification is meant to be changed.
const csv = parseCsv(readFileSync("docs/evaluation/source-review.csv", "utf8"));
const UC_LABEL = "University of California (systemwide)";
const rows: Row[] = csv.map((r) => ({
  school: r.School === UC_LABEL ? "UC_SYSTEMWIDE" : r.School,
  title: r["Prompt title"],
  primary: r["Your primary override"] || r["Final primary"] || r["Proposed primary"],
  secondaries: [1, 2, 3]
    .map((n) => r[`Your secondary ${n}`] || r[`Final secondary ${n}`] || r[`Secondary ${n}`])
    .filter(Boolean),
}));

const UC = [...new Set(listCoveredSchoolNames().filter((s) => s.startsWith("University of California,")))].sort();
/** One review row can stand for seven campus prompts. */
const expanded = rows.flatMap((row) => (row.school === "UC_SYSTEMWIDE" ? UC : [row.school]).map((school) => ({ ...row, school })));

// What the catalogue actually holds, via the committed review data.
const live = new Map<string, { primary: string; families: string[]; tags: string[]; fn: string }>();
for (const school of listCoveredSchoolNames()) {
  for (const prompt of lookupSchoolSource(school)?.prompts ?? []) {
    const r = categoryReview(school, prompt.externalRef);
    if (r) live.set(`${school}|${prompt.title}`, { primary: r[2], families: r[3], tags: r[4], fn: r[5] });
  }
}

const out: string[] = [];
const w = (line = "") => out.push(line);
const pct = (n: number, d: number) => `${((n / Math.max(d, 1)) * 100).toFixed(1)}%`;

w("# Reconciliation: manual review against the running system");
w();
w("Source of truth: [source-review.csv](source-review.csv), a byte copy of the");
w("owner's `Essay_Prompt_Category_Review_Claude.csv`.");
w();
w("The owner's decisions applied on top of it - promoting eight prompts to");
w("Activities & Impact and adding it as a secondary to nine others - are encoded in");
w("`scripts/regenerate-category-review.mts`, so the differences reported below");
w("against the raw CSV are expected and are listed as such.");
w();

w("## Every primary category in the review");
w();
w("| Review category | Current taxonomy slug | Reviewed prompts | Catalogue prompts now | Renamed / merged / dropped? |");
w("|---|---|---|---|---|");
const reviewPrimaries = new Map<string, number>();
for (const row of expanded) reviewPrimaries.set(row.primary, (reviewPrimaries.get(row.primary) ?? 0) + 1);
const liveByPrimary = new Map<string, number>();
for (const value of live.values()) liveByPrimary.set(value.primary, (liveByPrimary.get(value.primary) ?? 0) + 1);
// Widened: PROMPT_FAMILIES is `as const`, so an inferred Map would only accept
// the ten literal slugs as keys.
const displayName = new Map<string, string>(PROMPT_FAMILIES.map(([slug, name]) => [slug as string, name as string]));
for (const [name, count] of [...reviewPrimaries].sort((a, b) => b[1] - a[1])) {
  const slug = PRIMARY_TO_SLUG[name];
  const nowName = slug ? displayName.get(slug) : undefined;
  const note = !slug ? "**MISSING from taxonomy**"
    : nowName === name ? "no"
    : `renamed to \`${nowName}\``;
  w(`| ${name} | \`${slug ?? "—"}\` | ${count} | ${liveByPrimary.get(slug ?? "") ?? 0} | ${note} |`);
}
w();

w("## Every secondary category in the review");
w();
w("| Review secondary | Stored as | Kind | Reviewed assignments | Also a primary in the review? |");
w("|---|---|---|---|---|");
const reviewSecondaries = new Map<string, number>();
for (const row of expanded) for (const s of row.secondaries) reviewSecondaries.set(s, (reviewSecondaries.get(s) ?? 0) + 1);
const familySlugs = new Set<string>(PROMPT_FAMILIES.map(([slug]) => slug as string));
for (const [name, count] of [...reviewSecondaries].sort((a, b) => b[1] - a[1])) {
  const stored = SECONDARY_TO_STORED[name];
  const kind = familySlugs.has(stored) ? "family link" : (SECONDARY_TAGS as readonly string[]).includes(stored) ? "prompt tag" : "**UNMAPPED**";
  w(`| ${name} | \`${stored ?? "—"}\` | ${kind} | ${count} | ${reviewPrimaries.has(name) ? "yes" : "**no — secondary only**"} |`);
}
w();

w("## Did anything get lost between the review and the catalogue?");
w();
let mismatches = 0;
const detail: string[] = [];
for (const row of expanded) {
  const key = `${row.school}|${row.title}`;
  const actual = live.get(key);
  if (!actual) { mismatches += 1; detail.push(`| ${row.school} | ${row.title} | **absent from the catalogue** | |`); continue; }
  const expectedPrimary = PRIMARY_TO_SLUG[row.primary];
  const expectedSecondaries = row.secondaries.map((s) => SECONDARY_TO_STORED[s]).sort();
  const actualSecondaries = [...actual.families, ...actual.tags].sort();
  if (actual.primary !== expectedPrimary) {
    mismatches += 1;
    detail.push(`| ${row.school} | ${row.title} | primary | CSV \`${expectedPrimary}\` -> stored \`${actual.primary}\` |`);
  }
  if (JSON.stringify(expectedSecondaries) !== JSON.stringify(actualSecondaries)) {
    mismatches += 1;
    detail.push(`| ${row.school} | ${row.title} | secondaries | CSV [${expectedSecondaries}] -> stored [${actualSecondaries}] |`);
  }
}
if (mismatches === 0) {
  w(`**Nothing.** All ${expanded.length} prompts carry exactly the primary and secondary`);
  w("assignments the CSV gives them, with no owner decisions outstanding.");
} else {
  w(`**${mismatches} differences**, all of which should be owner decisions from the`);
  w("list above rather than losses. Anything here that is not one of those is a bug.");
  w();
  w("| School | Prompt | Field | Difference |");
  w("|---|---|---|---|");
  for (const line of detail.slice(0, 40)) w(line);
}
w();

w("## The two categories in question");
w();
for (const name of ["Activities & Impact", "Creativity"]) {
  const asPrimary = expanded.filter((r) => r.primary === name);
  const asSecondary = expanded.filter((r) => r.secondaries.includes(name));
  const asFirstSecondaryOfOther = expanded.filter((r) => r.primary === "Other" && r.secondaries[0] === name);
  w(`### ${name}`);
  w();
  w(`- As a **primary** in the review: **${asPrimary.length}** prompts`);
  w(`- As a **secondary** in the review: **${asSecondary.length}** prompts`);
  w(`- Filed \`Other\` with ${name} as its *first* secondary: **${asFirstSecondaryOfOther.length}** prompts`);
  w();
  if (asFirstSecondaryOfOther.length > 0) {
    w("Those prompts, which are the ones a promotion would move:");
    w();
    const seen = new Set<string>();
    for (const r of asFirstSecondaryOfOther) {
      if (seen.has(r.title)) continue;
      seen.add(r.title);
      const copies = asFirstSecondaryOfOther.filter((x) => x.title === r.title).length;
      w(`- ${r.title}${copies > 1 ? ` _(×${copies})_` : ""} — ${copies > 1 ? "UC systemwide" : r.school} · secondaries [${r.secondaries.join(", ")}]`);
    }
    w();
  }
}

w("## Essays");
w();
w("**There are no real student essays in this repository.** The only essay-shaped");
w("data is the eight synthetic samples in `DEMO_ESSAYS`, written for the example");
w("workspace and explicitly labelled as not the user's writing. Every earlier");
w("measurement that needed an essay side used either those eight or catalogue");
w("prompts standing in as ideal answers.");
w();
w("Prompts-as-essays are **not** essay counts and must not be read as any. A");
w("per-category count of real essays cannot be produced from this repository at");
w("all; it would need a production database, which this pass does not touch.");
w();
w("For completeness, the eight demo essays by primary category:");
w();
const { DEMO_ESSAYS } = await import("../src/lib/db/demo-workspace.ts");
const demoByFamily = new Map<string, string[]>();
for (const essay of DEMO_ESSAYS) {
  const list = demoByFamily.get(essay.family) ?? [];
  list.push(essay.title);
  demoByFamily.set(essay.family, list);
}
w("| Category | Demo essays | Titles |");
w("|---|---|---|");
for (const [family, titles] of [...demoByFamily].sort((a, b) => b[1].length - a[1].length)) {
  w(`| ${family} | ${titles.length} | ${titles.join("; ")} |`);
}
w(`| _(all others)_ | 0 | — |`);
w();
w(`Total: ${DEMO_ESSAYS.length} synthetic essays across ${demoByFamily.size} of ${PROMPT_FAMILIES.length} categories. ${pct(demoByFamily.size, PROMPT_FAMILIES.length)} coverage.`);
w();

writeFileSync("docs/evaluation/reconciliation.md", out.join("\n") + "\n");
console.log(`Wrote docs/evaluation/reconciliation.md (${mismatches} mismatches over ${expanded.length} prompts)`);
