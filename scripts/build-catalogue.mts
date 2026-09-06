/**
 * Regenerates src/lib/retrieval/sources/*.ts from the committed 2026-27
 * research master (docs/catalogue/master-supplemental-2026-27.json).
 *
 * The generator is mechanical; every judgement lives in catalogue-transform.mts.
 * Re-running it with an unchanged master and transform is a no-op, so the
 * catalogue is reproducible from files in the repo rather than from a hand
 * transcription.
 *
 * What it deliberately carries over from the existing records rather than
 * inventing:
 *   - externalRef and title for any prompt whose text is unchanged, because
 *     category-review.ts and prompt-vectors.ts are keyed by (school, ref) and
 *     the review CSV joins on (school, title). Changing either would discard
 *     the owner's hand classification and the precomputed embeddings.
 *   - applicationPlatform, which was researched per school and is not in the
 *     master.
 *   - programKey/programLabel for preserved prompts, so encoded scope does not
 *     churn.
 *
 *   node --experimental-strip-types --import ./scripts/ts-resolve.mjs \
 *     scripts/build-catalogue.mts [--check]
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";

import type { RawPromptRecord, SchoolSourceRecord } from "../src/lib/retrieval/types.ts";
import { DROPPED, GROUPS, OPTIONAL_CAPS, PROGRAM_OVERRIDES, REF_CARRYOVER, REQUIREMENT_OVERRIDES, UC_CAMPUSES } from "./catalogue-transform.mts";

/**
 * The catalogue as it stood before this rebuild, frozen as a file.
 *
 * Read from a snapshot rather than from the live registry on purpose: the
 * generator rewrites that registry, so on a second run "what existed before"
 * would be its own output and every prompt would look preserved.
 */
const BASELINE = "docs/catalogue/previous-catalogue.json";
const RETRIEVED_AT = "2026-08-31";
const CYCLE_LABEL = "2026–27";
const MASTER = "docs/catalogue/master-supplemental-2026-27.json";
const checkOnly = process.argv.includes("--check");

type MasterPrompt = {
  prompt_text: string;
  limit: number | string | null;
  limit_type: string | null;
  requirement: string;
  condition: string | null;
  undergraduate_school: string | null;
  program_or_major: string | null;
  application_platform: string;
  source_urls: string[];
  notes: string;
};
type MasterSchool = {
  school: string;
  verification_status: string;
  notes: string;
  sources: { url: string; source_name: string; source_type: string; cycle_explicitly_confirmed: boolean }[];
  prompts: MasterPrompt[];
};

type BaselinePrompt = {
  externalRef: string; title: string; promptText: string; requirement: string;
  programKey: string | null; programLabel: string | null; groupKey: string | null;
};
type BaselineSchool = { schoolName: string; applicationPlatform: string; sharedApplicationKey: string | null; prompts: BaselinePrompt[] };

const master: { schools: MasterSchool[] } = JSON.parse(readFileSync(MASTER, "utf8"));
const baseline = new Map<string, BaselineSchool>(
  (JSON.parse(readFileSync(BASELINE, "utf8")) as BaselineSchool[]).map((school) => [school.schoolName, school]),
);
const problems: string[] = [];
const report = { schools: 0, prompts: 0, preserved: 0, reworded: 0, added: 0, dropped: 0, grouped: 0, programGated: 0, unresolved: 0 };

/** Secondary/consultant domains may corroborate but never stand as the citation. */
const SECONDARY_DOMAINS = [
  "ivycoach.com", "collegevine.com", "prepmaven.com", "gradgpt.com", "collegeessayguy.com",
  "collegeessaygrader.com", "deweysmart.com", "cosmic.nyc", "collegetransitions.com",
  "selectiveadmissions.com", "collegeessayadvisors.com", "ivywise.com", "ivymax.com",
  "connectprep.com", "toptieradmissions.com", "internationalcollegecounselors.com",
  "clearadmit.com", "kolly.ai", "haloadmit.com", "nextadmit.com", "scholarships360.org",
  "admissionsight.com", "collegeadvisor.com", "koppelmangroup.com", "write-yourself-in.com",
  "indigoresearch.org", "appybara.org", "alphaapply.ai", "jengo.me", "clastify.com",
  "ivyscholars.com", "ivycentral.com", "devilsquill.com", "nextgenadmit.com", "orieladmissions.com",
  "scribd.com", "texadmissions.com", "collegeconfidential.com", "getintocollege.com",
];
const isSecondary = (url: string) => SECONDARY_DOMAINS.some((domain) => url.includes(domain));

const norm = (value: string) => value.replace(/\s+/g, " ").trim();
const normKey = (value: string) => norm(value).toLowerCase().replace(/[^a-z0-9 ]/g, "");

function slug(value: string, max = 48) {
  const base = norm(value).toLowerCase()
    .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (base.length <= max) return base;
  const cut = base.slice(0, max);
  return cut.slice(0, cut.lastIndexOf("-") > 12 ? cut.lastIndexOf("-") : max).replace(/-+$/, "");
}

/**
 * A short human title from the prompt's own words.
 *
 * Only used for prompts the master adds - a prompt already in the catalogue
 * keeps the title it was reviewed under. Never paraphrases: it takes the
 * opening clause verbatim and stops on a word boundary, so a title can be
 * clumsy but not wrong.
 */
function deriveTitle(text: string) {
  let first = norm(text).split(/(?<=[.?!])\s+/)[0] ?? norm(text);
  first = first.replace(/^["“”'']+/, "").replace(/[.?!:;,]+$/, "");
  if (first.length <= 72) return first;
  const cut = first.slice(0, 72);
  const boundary = Math.max(cut.lastIndexOf(" "), 40);
  return cut.slice(0, boundary).replace(/[,;:.]$/, "");
}

/** Sentences that describe the research session rather than the requirement. */
const SCAFFOLD = /(fetch|fetching|web_fetch|robots\.txt|search tool|WebSearch|browser tool|this session|this pass|this research|research date|snippet|indexed|tool-level|could not be (directly |independently )?(fetch|load|render|read|confirm)|NEEDS_REVIEW|UNRESOLVED|RESOLVED|stale|audit trail|do not treat|re-check|recheck|flagged|caveat|not yet confirmed|outdated|Scribd|conflict|unreliable|erroneous|treated as|assessed as|superseded|not used|excluded from this record|removed from this record|Retained here|for transparency)/i;

/**
 * The user-facing justification, from the master's own notes.
 *
 * Takes whole leading sentences and stops at the first one that talks about the
 * research process rather than the school's requirement - the master's notes
 * are an audit trail as much as a summary, and a student reading "the fetch
 * tool returned 404" learns nothing about their essays. Nothing is reworded.
 */
function deriveNote(school: MasterSchool) {
  const sentences = norm(school.notes).split(/(?<=[.!?])\s+(?=[A-Z(“"])/);
  const kept: string[] = [];
  for (const sentence of sentences) {
    if (SCAFFOLD.test(sentence)) break;
    kept.push(sentence);
    if (kept.join(" ").length >= 220) break;
  }
  let note = kept.join(" ").trim().replace(/^\(\d+\)\s*/, "");
  if (note.length < 60) {
    // Too terse to justify anything on its own (some notes open with
    // "Resolved."), so fall back to the first substantial sentence.
    const substantial = sentences.find((sentence) => sentence.length >= 60 && !SCAFFOLD.test(sentence));
    note = norm([note, substantial ?? ""].join(" "));
  }
  if (note.length > 700) note = `${note.slice(0, note.lastIndexOf(" ", 700))}…`;
  // The master enumerates multi-part findings; the leading "(1)" is meaningless
  // once only the first part is kept.
  return note.trim().replace(/^\(\d+\)\s*/, "");
}

/**
 * The word/character limits the schema can hold, plus a note for the ones it
 * cannot.
 *
 * Pages, paragraphs, sentences and "13 words per stem" have no column, so the
 * numeric limits stay null and the constraint is preserved verbatim in the
 * note. Inventing a word count from a page count would be a fabrication the
 * student would then write to.
 */
function limitsFor(prompt: MasterPrompt, where: string) {
  const out: { minWordCount?: number; maxWordCount?: number; minCharCount?: number; maxCharCount?: number; note?: string } = {};
  const type = prompt.limit_type;
  let limit = prompt.limit;

  // A malformed range ("350-500") is a min and a max, not a string.
  let rangeMin: number | null = null;
  if (typeof limit === "string") {
    const range = limit.match(/^(\d+)\s*[-–]\s*(\d+)$/);
    if (!range) {
      problems.push(`${where}: limit ${JSON.stringify(limit)} is neither a number nor a range.`);
      return out;
    }
    rangeMin = Number(range[1]);
    limit = Number(range[2]);
  }
  if (limit != null && typeof limit !== "number") {
    problems.push(`${where}: limit of type ${typeof limit}.`);
    return out;
  }

  // Minimums live in the master's prose, never in a field of their own.
  const notes = `${prompt.notes ?? ""} ${prompt.condition ?? ""}`;
  const stated = notes.match(/Minimum\s+([\d,]+)\s+(?:words?|pages?)/i)
    ?? notes.match(/(?:range|reported as|allows?|limit is)\s+(?:approximately\s+)?([\d,]+)\s*[-–]\s*[\d,]+\s*words?/i)
    ?? notes.match(/([\d,]+)\s*[-–]\s*[\d,]+\s*word range/i);
  const min = rangeMin ?? (stated ? Number(stated[1].replace(/,/g, "")) : null);

  // A limit that applies per item rather than to the whole answer: Colgate caps
  // each of thirteen sentence stems at 13 words, USC each of three words at 25
  // characters. Stored as a flat maximum that reads as a cap on the whole
  // response, so the master's own qualifying sentence is carried into the note.
  const scoped = notes.match(/[^.]*\b(?:applies (?:separately|to each)|each of the \d+|per (?:stem|book|line|item|response)|allowed for each)\b[^.]*\./i);

  const words = type === "words" || type === "words (about)";
  const chars = type === "characters";
  if (limit != null && words) {
    out.maxWordCount = limit;
    if (min != null && min <= limit) out.minWordCount = min;
    if (type === "words (about)") out.note = `About ${limit} words.`;
  } else if (limit != null && chars) {
    out.maxCharCount = limit;
    if (min != null && min <= limit) out.minCharCount = min;
  } else if (limit != null) {
    // A unit the schema cannot represent: keep it exactly, as prose.
    const unit = (type ?? "units").replace(/_/g, " ");
    const singular = limit === 1 ? unit.replace(/s$/, "") : unit;
    out.note = `Limit: ${limit} ${singular}.`;
  } else if (type && type !== "none" && type !== "not stated" && type !== "unknown") {
    out.note = `Length: ${type}.`;
  }
  if (limit == null && (type === "none" || type === "not stated" || type === "unknown" || type == null)) {
    out.note = "The source states no word or character limit.";
  }
  if (scoped) out.note = [out.note, norm(scoped[0])].filter(Boolean).join(" ");
  return out;
}

/** The scope of a program-gated prompt, as the app can resolve it. */
function programFor(prompt: MasterPrompt) {
  const label = prompt.program_or_major ?? prompt.undergraduate_school;
  return label ? { programKey: slug(label), programLabel: norm(label) } : null;
}

function buildSchool(school: MasterSchool): SchoolSourceRecord {
  const existing = baseline.get(school.school);
  if (!existing) problems.push(`${school.school}: absent from the baseline - school names must match TOP_UNIVERSITIES.`);
  const existingByText = new Map((existing?.prompts ?? []).map((prompt) => [normKey(prompt.promptText), prompt]));
  // Same question, reworded: the official text is authoritative, but the ref
  // and title are what the owner's review and the committed vectors are keyed
  // by, so they are carried across on an unambiguous opening-clause match. The
  // import path then sees a changed prompt and flags it for review, which is
  // exactly what should happen to a reworded question.
  const unclaimed = new Map(existingByText);
  const words = (value: string) => new Set(normKey(value).split(" ").filter((word) => word.length > 3));
  const overlap = (a: string, b: string) => {
    const [left, right] = [words(a), words(b)];
    if (left.size === 0 || right.size === 0) return 0;
    let shared = 0;
    for (const word of left) if (right.has(word)) shared += 1;
    // Containment rather than Jaccard: a school that kept the question and
    // prepended a framing paragraph (Pomona's shared stem, Bowdoin's poem) has
    // not asked a new question, and Jaccard would call it one.
    // Below a few shared words containment is meaningless: a one-word baseline
    // prompt ("Why Wake?") would match anything mentioning that word. Those are
    // carried across by name in REF_CARRYOVER instead, or allowed to retire.
    if (shared < 3 || Math.min(left.size, right.size) < 3) return 0;
    return shared / Math.min(left.size, right.size);
  };
  const fuzzy = (text: string) => {
    const key = normKey(text);
    const byPrefix = [...unclaimed.keys()].filter((candidate) => candidate.slice(0, 40) === key.slice(0, 40));
    let winner = byPrefix.length === 1 ? byPrefix[0] : undefined;
    if (!winner) {
      const ranked = [...unclaimed.keys()]
        .map((candidate) => ({ candidate, score: overlap(candidate, key) }))
        .sort((a, b) => b.score - a.score);
      // Unique and clear: the best must clear the bar and beat the runner-up,
      // so two similar prompts at one school are left for a human rather than
      // guessed between.
      if (ranked[0]?.score >= 0.7 && (ranked[1]?.score ?? 0) <= ranked[0].score - 0.15) winner = ranked[0].candidate;
    }
    if (!winner) return undefined;
    const match = unclaimed.get(winner);
    unclaimed.delete(winner);
    return match;
  };
  const byRef = new Map((existing?.prompts ?? []).map((prompt) => [prompt.externalRef, prompt]));
  const usedRefs = new Set<string>();

  // Drops first, so every later index refers to the same row the transform
  // table was written against.
  const drops = DROPPED.filter(([name]) => name === school.school);
  for (const [, index, startsWith] of drops) {
    const row = school.prompts[index];
    if (!row) problems.push(`${school.school}: dropped index ${index} does not exist.`);
    else if (!norm(row.prompt_text).startsWith(startsWith)) {
      problems.push(`${school.school}[${index}]: expected a row starting ${JSON.stringify(startsWith)}, found ${JSON.stringify(norm(row.prompt_text).slice(0, 60))}.`);
    }
  }
  const droppedIndexes = new Set(drops.map(([, index]) => index));
  const rows = school.prompts.filter((_, index) => !droppedIndexes.has(index));
  report.dropped += droppedIndexes.size;

  const groupSpec = GROUPS.find((entry) => entry.school === school.school);
  if (groupSpec && groupSpec.size !== rows.length) {
    problems.push(`${school.school}: transform expects ${groupSpec.size} prompts after drops, master has ${rows.length}.`);
  }
  const capSpec = OPTIONAL_CAPS.filter((entry) => entry.school === school.school);
  const groupOf = (index: number) => groupSpec?.groups.find((group) => group.members.includes(index));
  const capOf = (index: number) => capSpec.find((cap) => cap.members.includes(index));

  const prompts: RawPromptRecord[] = rows.map((row, index) => {
    const where = `${school.school}[${index}]`;
    const text = norm(row.prompt_text);
    const exact = existingByText.get(normKey(text));
    if (exact) unclaimed.delete(normKey(text));
    const carryover = REF_CARRYOVER.find(([name, at]) => name === school.school && at === index);
    if (carryover && !text.startsWith(carryover[2])) {
      problems.push(`${where}: ref carryover expected a row starting ${JSON.stringify(carryover[2])}.`);
    }
    const carried = carryover ? byRef.get(carryover[3]) : undefined;
    if (carryover && !carried) problems.push(`${where}: ref carryover names ${JSON.stringify(carryover[3])}, which is not in the baseline.`);
    if (carried) unclaimed.delete(normKey(carried.promptText));
    const kept = exact ?? carried ?? fuzzy(text);
    if (kept && !exact) report.reworded += 1;
    const group = groupOf(index);
    const cap = capOf(index);
    const limits = limitsFor(row, where);

    let externalRef = kept?.externalRef ?? slug(deriveTitle(text), 56);
    if (!externalRef) externalRef = `prompt-${index + 1}`;
    while (usedRefs.has(externalRef)) externalRef = `${externalRef}-${index + 1}`;
    usedRefs.add(externalRef);
    if (kept) report.preserved += 1; else report.added += 1;

    const assertPrefix = (startsWith: string, what: string) => {
      if (!text.startsWith(startsWith)) problems.push(`${where}: ${what} expected a row starting ${JSON.stringify(startsWith)}.`);
    };
    const requirementOverride = REQUIREMENT_OVERRIDES.find(([name, at]) => name === school.school && at === index);
    if (requirementOverride) assertPrefix(requirementOverride[2], "requirement override");
    const programOverride = PROGRAM_OVERRIDES.find(([name, at]) => name === school.school && at === index);
    if (programOverride) assertPrefix(programOverride[2], "program override");
    // Requirement, the one place the master's vocabulary is not taken
    // literally. Its `conditional` conflates "you choose one of these" with
    // "this applies only to your program"; the app models those separately.
    const program = programOverride
      ? { programKey: programOverride[3], programLabel: programOverride[4] }
      : group?.programKey
      ? { programKey: group.programKey, programLabel: group.programLabel ?? group.label }
      : kept?.programKey
        ? { programKey: kept.programKey, programLabel: kept.programLabel ?? null }
        : programFor(row);
    const masterRequirement = requirementOverride?.[3]
      ?? (row.requirement.startsWith("conditional") ? "conditional" : row.requirement);

    let requirement: RawPromptRecord["requirement"];
    let conditionalNote: string | null = null;
    if (group) {
      // A choose-N member is never individually required - the group carries
      // the obligation. But a set that only applies to one program stays
      // `conditional` so the program gate is evaluated first: W&L's Johnson
      // Scholarship prompts are choose-one-of-five *and* Johnson-only, and
      // marking them optional would require one of them of every applicant
      // (see the group/programKey branch in summarizeWorkload).
      requirement = group.programKey ? "conditional" : "optional";
      conditionalNote = group.programKey ? norm(row.condition ?? "") || `Applies only to ${group.programLabel ?? group.label} applicants.` : null;
      report.grouped += 1;
    } else if (masterRequirement === "conditional") {
      requirement = "conditional";
      conditionalNote = norm(row.condition ?? "") || "Applies only to a subset of applicants; see the source.";
      if (program) report.programGated += 1; else report.unresolved += 1;
    } else if (masterRequirement === "required" || masterRequirement === "optional") {
      requirement = masterRequirement;
      conditionalNote = cap ? cap.note : null;
      // A prompt the override downgrades out of `conditional` still had a
      // caveat worth keeping (Yale's short takes are not asked of QuestBridge
      // applicants); it moves to the note, where it informs without being read
      // as a gate the app can resolve.
      if (requirementOverride && row.requirement.startsWith("conditional") && row.condition) {
        limits.note = [limits.note, norm(row.condition)].filter(Boolean).join(" ");
      }
    } else {
      problems.push(`${where}: unmapped requirement ${JSON.stringify(row.requirement)}.`);
      requirement = "optional";
    }
    if (conditionalNote && conditionalNote.length > 600) conditionalNote = `${conditionalNote.slice(0, conditionalNote.lastIndexOf(" ", 600))}…`;

    report.prompts += 1;
    return {
      externalRef,
      title: kept?.title ?? deriveTitle(text),
      promptText: text,
      ...(limits.minWordCount != null ? { minWordCount: limits.minWordCount } : {}),
      ...(limits.maxWordCount != null ? { maxWordCount: limits.maxWordCount } : {}),
      ...(limits.minCharCount != null ? { minCharCount: limits.minCharCount } : {}),
      ...(limits.maxCharCount != null ? { maxCharCount: limits.maxCharCount } : {}),
      requirement,
      ...(conditionalNote ? { conditionalNote } : {}),
      ...(group ? { groupKey: group.key } : {}),
      ...(requirement === "conditional" && program ? program : {}),
      ...(limits.note ? { note: limits.note } : {}),
    } as RawPromptRecord;
  });

  const official = school.sources.find((source) => source.source_type === "official" && !isSecondary(source.url))
    ?? school.sources.find((source) => !isSecondary(source.url));
  if (!official) problems.push(`${school.school}: no non-secondary source to cite.`);

  const verificationStatus: SchoolSourceRecord["verificationStatus"] = prompts.length === 0
    ? "no-supplement-confirmed"
    : school.verification_status === "VERIFIED" ? "officially-verified" : "corroborated";

  report.schools += 1;
  return {
    schoolName: school.school,
    cycleLabel: CYCLE_LABEL,
    verificationStatus,
    applicationPlatform: (existing?.applicationPlatform ?? "unknown") as SchoolSourceRecord["applicationPlatform"],
    sourceUrl: official?.url ?? null,
    retrievedAt: RETRIEVED_AT,
    note: deriveNote(school),
    ...(groupSpec ? { promptGroups: groupSpec.groups.map(({ key, label, requiredCount }) => ({ key, label, requiredCount })) } : {}),
    prompts,
    ...(existing?.sharedApplicationKey ? { sharedApplicationKey: existing.sharedApplicationKey } : {}),
  };
}

export const built = new Map<string, SchoolSourceRecord>();
for (const school of master.schools) built.set(school.school, buildSchool(school));

// Every school covered before the rebuild must still be covered after it.
for (const name of baseline.keys()) {
  if (!built.has(name)) problems.push(`${name}: covered today but absent from the master.`);
}

if (problems.length > 0) {
  console.error(`${problems.length} problem(s) - nothing written:`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(JSON.stringify(report, null, 2));
if (checkOnly) {
  writeFileSync("/tmp/built-catalogue.json", JSON.stringify([...built.values()], null, 1));
  console.log("--check: wrote /tmp/built-catalogue.json, no source files touched.");
}

// ---------------------------------------------------------------- emission

const PROMPT_KEY_ORDER = [
  "externalRef", "title", "promptText", "minWordCount", "maxWordCount", "minCharCount", "maxCharCount",
  "requirement", "conditionalNote", "groupKey", "programKey", "programLabel", "note", "verificationStatus",
] as const;

const q = (value: unknown) => JSON.stringify(value);

function promptLiteral(prompt: RawPromptRecord, indent: string) {
  const record = prompt as unknown as Record<string, unknown>;
  const parts = PROMPT_KEY_ORDER
    .filter((key) => record[key] !== undefined && record[key] !== null)
    .map((key) => `${key}: ${q(record[key])}`);
  const unknown = Object.keys(record).filter((key) => !(PROMPT_KEY_ORDER as readonly string[]).includes(key));
  if (unknown.length > 0) throw new Error(`Prompt ${prompt.externalRef} carries unemitted keys: ${unknown.join(", ")}`);
  return `${indent}{ ${parts.join(", ")} },`;
}

function recordLiteral(record: SchoolSourceRecord, exportName: string, promptsExpression?: string) {
  const lines = [
    `export const ${exportName}: SchoolSourceRecord = {`,
    `  schoolName: ${q(record.schoolName)},`,
    `  cycleLabel: ${q(record.cycleLabel)},`,
    `  verificationStatus: ${q(record.verificationStatus)},`,
    `  applicationPlatform: ${q(record.applicationPlatform)},`,
    `  sourceUrl: ${q(record.sourceUrl)},`,
    `  retrievedAt: ${q(record.retrievedAt)},`,
    `  note: ${q(record.note)},`,
  ];
  if (record.promptGroups?.length) {
    lines.push("  promptGroups: [");
    for (const group of record.promptGroups) {
      lines.push(`    { key: ${q(group.key)}, label: ${q(group.label)}, requiredCount: ${group.requiredCount} },`);
    }
    lines.push("  ],");
  }
  if (promptsExpression) {
    lines.push(`  prompts: ${promptsExpression},`);
  } else if (record.prompts.length === 0) {
    lines.push("  prompts: [],");
  } else {
    lines.push("  prompts: [");
    for (const prompt of record.prompts) lines.push(promptLiteral(prompt, "    "));
    lines.push("  ],");
  }
  if (record.sharedApplicationKey) lines.push(`  sharedApplicationKey: ${q(record.sharedApplicationKey)},`);
  lines.push("};");
  return lines.join("\n");
}

const BANNER = `// GENERATED by scripts/build-catalogue.mts from
// docs/catalogue/master-supplemental-2026-27.json. Do not edit by hand: the
// judgements (dropped rows, choose-N groups, scope) live in
// scripts/catalogue-transform.mts, and re-running the generator overwrites this.
`;

/** school -> { file, exportName }, read from the files themselves. */
function targetFiles() {
  const map = new Map<string, { file: string; exportName: string }>();
  for (const file of readdirSync("src/lib/retrieval/sources")) {
    if (!file.endsWith(".ts") || file === "university-of-california.ts") continue;
    const text = readFileSync(`src/lib/retrieval/sources/${file}`, "utf8");
    const exportName = text.match(/export const (\w+)\s*:\s*SchoolSourceRecord/)?.[1];
    const schoolName = text.match(/schoolName:\s*"([^"]+)"/)?.[1];
    if (!exportName || !schoolName) throw new Error(`Cannot read school/export from sources/${file}`);
    map.set(schoolName, { file, exportName });
  }
  for (const campus of UC_CAMPUSES) map.set(campus.school, { file: "university-of-california.ts", exportName: campus.exportName });
  return map;
}

function writeUcFile() {
  const campuses = UC_CAMPUSES.map((campus) => ({ campus, record: built.get(campus.school)! }));
  const shared = campuses[0].record.prompts.slice(0, 8);
  for (const { campus, record } of campuses) {
    const own = JSON.stringify(record.prompts.slice(0, 8));
    if (own !== JSON.stringify(shared)) throw new Error(`${campus.school}: Personal Insight Questions differ from Berkeley's - they must be identical to collapse.`);
  }
  const parts = [
    'import type { RawPromptRecord, SchoolSourceRecord } from "../types";',
    "",
    BANNER.trimEnd(),
    "",
    "// One array, seven campuses: the Personal Insight Questions are the same",
    "// eight questions on one application, so they are shared rather than copied.",
    "// validateCanonicalAgreement in ../normalize.ts fails the build if they ever",
    "// drift apart, and sharing the array is what makes that impossible here.",
    "const PERSONAL_INSIGHT_QUESTIONS: RawPromptRecord[] = [",
    ...shared.map((prompt) => promptLiteral(prompt, "  ")),
    "];",
    "",
  ];
  for (const { campus, record } of campuses) {
    const extras = record.prompts.slice(8);
    let expression = "PERSONAL_INSIGHT_QUESTIONS";
    if (extras.length > 0) {
      parts.push(`const ${campus.exportName}Extras: RawPromptRecord[] = [`, ...extras.map((prompt) => promptLiteral(prompt, "  ")), "];", "");
      expression = `[...PERSONAL_INSIGHT_QUESTIONS, ...${campus.exportName}Extras]`;
    }
    parts.push(recordLiteral(record, campus.exportName, expression), "");
  }
  writeFileSync("src/lib/retrieval/sources/university-of-california.ts", `${parts.join("\n").trimEnd()}\n`);
  return campuses.length;
}

if (!checkOnly) {
  const targets = targetFiles();
  const missing = [...built.keys()].filter((school) => !targets.has(school));
  if (missing.length > 0) {
    console.error(`No source file for: ${missing.join(", ")}`);
    process.exit(1);
  }
  let written = 0;
  for (const [school, record] of built) {
    const target = targets.get(school)!;
    if (target.file === "university-of-california.ts") continue;
    const body = `import type { SchoolSourceRecord } from "../types";\n\n${BANNER}\n${recordLiteral(record, target.exportName)}\n`;
    writeFileSync(`src/lib/retrieval/sources/${target.file}`, body);
    written += 1;
  }
  written += writeUcFile();
  console.log(`Wrote ${written} school record(s) across ${new Set([...targets.values()].map((t) => t.file)).size} file(s).`);
}
