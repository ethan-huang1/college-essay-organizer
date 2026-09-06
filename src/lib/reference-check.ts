import { escapeForRegExp, locateSchoolMentions } from "./school-mentions";

/**
 * Flags a reused essay for content that may still belong to the school it was
 * originally written for, so the student can review it before submitting
 * elsewhere. Detection only - nothing here rewrites, replaces, or removes
 * anything from the essay.
 *
 * "confirmed" reuses the same deterministic school-name detector `reuse.ts`
 * already relies on for risk scoring (`locateSchoolMentions`), plus whatever
 * the student has manually declared in `schoolSpecificPhrases`. "potential" is
 * a conservative, keyword-anchored heuristic (professor names, course codes,
 * capitalized-phrase-plus-institutional-noun) - deliberately narrow, so it
 * misses bare unadorned names with no such anchor (see the module doc on
 * POTENTIAL_PATTERNS) rather than flooding the essay with false positives.
 */

export type ReferenceFlagKind = "confirmed" | "potential";

export type ReferenceFlag = {
  id: string;
  kind: ReferenceFlagKind;
  text: string;
  start: number;
  end: number;
  note: string;
};

export type ReferenceSegment = { text: string; flag: ReferenceFlag | null };

export type ReferenceCheckParams = {
  currentSchoolName: string | null;
  /** Every other school's name - the caller excludes currentSchoolName. */
  otherSchoolNames: readonly string[];
  schoolSpecificPhrases: readonly string[];
};

type Span = { start: number; end: number; matchedText: string };

function confirmedNote(currentSchoolName: string | null): string {
  return currentSchoolName
    ? `This references another school. Review this before submitting to ${currentSchoolName}.`
    : "This references another school. Review this before submitting.";
}

function potentialNote(currentSchoolName: string | null): string {
  return currentSchoolName
    ? `This may be school-specific. Confirm that this reference is appropriate for ${currentSchoolName}.`
    : "This may be school-specific. Confirm that this reference is appropriate before submitting.";
}

/** Every occurrence of a declared phrase, case-insensitive whole-word. */
function locatePhraseOccurrences(text: string, phrase: string): Span[] {
  const pattern = new RegExp(`\\b${escapeForRegExp(phrase)}\\b`, "gi");
  const found: Span[] = [];
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    found.push({ start: match.index, end: match.index + match[0].length, matchedText: match[0] });
  }
  return found;
}

function confirmedFlags(content: string, params: ReferenceCheckParams): ReferenceFlag[] {
  const note = confirmedNote(params.currentSchoolName);
  const current = (params.currentSchoolName ?? "").trim().toLowerCase();

  const fromSchools = locateSchoolMentions(content, params.otherSchoolNames).map((mention) => ({
    id: `confirmed:${mention.start}:${mention.end}`,
    kind: "confirmed" as const,
    text: mention.matchedText,
    start: mention.start,
    end: mention.end,
    note,
  }));

  const phrases = params.schoolSpecificPhrases
    .map((phrase) => phrase.trim())
    .filter((phrase) => phrase && phrase.toLowerCase() !== current);

  const fromPhrases = phrases.flatMap((phrase) =>
    locatePhraseOccurrences(content, phrase).map((span) => ({
      id: `confirmed:${span.start}:${span.end}`,
      kind: "confirmed" as const,
      text: span.matchedText,
      start: span.start,
      end: span.end,
      note,
    })),
  );

  return [...fromSchools, ...fromPhrases];
}

/**
 * Conservative, keyword-anchored "might be school-specific" patterns.
 *
 * Deliberately narrow: a bare two-word name with no institutional anchor
 * (e.g. "Tiger Talk") is not caught here - only patterns with a strong signal
 * are, to avoid drowning the essay in false positives from ordinary
 * capitalized prose. The manual `schoolSpecificPhrases` field remains the way
 * to flag names this heuristic can't reach.
 */
const PROFESSOR_PATTERN = () => /\b(?:Professor|Prof\.)\s+[A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+)?\b/g;

// 2-4 uppercase letters, optional space, 2-3 digits (not followed by another
// digit, so "1500" doesn't partially match as "150"), optional trailing letter.
const COURSE_CODE_PATTERN = () => /\b[A-Z]{2,4}\s?\d{2,3}(?!\d)[A-Z]?\b/g;
const COURSE_CODE_STOPLIST = new Set([
  "SAT", "ACT", "GPA", "GRE", "LSAT", "MCAT", "TOEFL", "IELTS", "PSAT",
  "AP", "IB", "ID", "ZIP", "GDP", "CEO", "CFO", "FAQ", "DIY", "USA", "US", "UK",
]);

const INSTITUTIONAL_NOUNS = [
  "Library", "Libraries", "Hall", "Center", "Centre", "Institute", "Program", "Programme",
  "Society", "Club", "Fellowship", "House", "Union", "Auditorium", "Stadium", "Gymnasium",
  "Chapel", "Quad", "Dormitory", "Residence", "Museum", "Laboratory", "Lab", "Observatory",
  "Theater", "Theatre", "Orchestra", "Choir",
].join("|");
// Bounded {1,4} title-case-word prefix, single alternation group at the end -
// linear time, no nested-quantifier backtracking risk.
const INSTITUTIONAL_PHRASE_PATTERN = () => new RegExp(`\\b(?:[A-Z][a-zA-Z'&-]*\\s){1,4}(?:${INSTITUTIONAL_NOUNS})\\b`, "g");

function runGlobal(pattern: RegExp, text: string): Span[] {
  const found: Span[] = [];
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    found.push({ start: match.index, end: match.index + match[0].length, matchedText: match[0] });
  }
  return found;
}

function potentialFlags(
  content: string,
  params: ReferenceCheckParams,
  confirmedTexts: ReadonlySet<string>,
): ReferenceFlag[] {
  const note = potentialNote(params.currentSchoolName);
  const currentSchoolSpans = params.currentSchoolName
    ? locateSchoolMentions(content, [params.currentSchoolName])
    : [];
  const overlapsCurrentSchool = (span: Span) =>
    currentSchoolSpans.some((mention) => span.start < mention.end && mention.start < span.end);

  const raw = [
    ...runGlobal(PROFESSOR_PATTERN(), content),
    ...runGlobal(COURSE_CODE_PATTERN(), content).filter((span) => {
      const prefix = span.matchedText.match(/^[A-Z]{2,4}/)?.[0] ?? "";
      return !COURSE_CODE_STOPLIST.has(prefix);
    }),
    ...runGlobal(INSTITUTIONAL_PHRASE_PATTERN(), content),
  ];

  return raw
    .filter((span) => !confirmedTexts.has(span.matchedText.toLowerCase()))
    .filter((span) => !overlapsCurrentSchool(span))
    .map((span) => ({
      id: `potential:${span.start}:${span.end}`,
      kind: "potential" as const,
      text: span.matchedText,
      start: span.start,
      end: span.end,
      note,
    }));
}

/**
 * Confirmed always beats potential at an overlapping span; within the same
 * kind, the longer match wins (e.g. "Princeton University" over bare
 * "Princeton"). ponytail: O(n^2) in flag count via the overlap scan below -
 * fine at essay-length flag counts (tens, not thousands), same tradeoff
 * word-diff.ts already accepts for its diff table.
 */
function resolveOverlaps(flags: ReferenceFlag[]): ReferenceFlag[] {
  const ranked = [...flags].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "confirmed" ? -1 : 1;
    const lengthDiff = b.end - b.start - (a.end - a.start);
    if (lengthDiff !== 0) return lengthDiff;
    return a.start - b.start;
  });
  const accepted: ReferenceFlag[] = [];
  const overlaps = (a: ReferenceFlag, b: ReferenceFlag) => a.start < b.end && b.start < a.end;
  for (const flag of ranked) {
    if (accepted.some((other) => overlaps(flag, other))) continue;
    accepted.push(flag);
  }
  return accepted.sort((a, b) => a.start - b.start);
}

export function findReferenceFlags(content: string, params: ReferenceCheckParams): ReferenceFlag[] {
  const confirmed = confirmedFlags(content, params);
  const confirmedTexts = new Set(confirmed.map((flag) => flag.text.toLowerCase()));
  const potential = potentialFlags(content, params, confirmedTexts);
  return resolveOverlaps([...confirmed, ...potential]);
}

/** Slices `content` into segments covering every character exactly once. */
export function segmentContent(content: string, flags: readonly ReferenceFlag[]): ReferenceSegment[] {
  const sorted = [...flags].sort((a, b) => a.start - b.start);
  const segments: ReferenceSegment[] = [];
  let cursor = 0;
  for (const flag of sorted) {
    if (flag.start > cursor) segments.push({ text: content.slice(cursor, flag.start), flag: null });
    segments.push({ text: content.slice(flag.start, flag.end), flag });
    cursor = flag.end;
  }
  if (cursor < content.length) segments.push({ text: content.slice(cursor), flag: null });
  return segments;
}

/** A short, readable snippet of the text around a flag, for compact lists. */
export function snippetAround(content: string, flag: ReferenceFlag, radius = 40): string {
  const collapse = (value: string) => value.replace(/\s+/g, " ").trim();
  const before = content.slice(Math.max(0, flag.start - radius), flag.start);
  const after = content.slice(flag.end, flag.end + radius);
  const prefix = flag.start - radius > 0 ? "…" : "";
  const suffix = flag.end + radius < content.length ? "…" : "";
  return `${prefix}${collapse(before)} ${flag.text} ${collapse(after)}${suffix}`.trim();
}

export function checkReferences(
  content: string,
  params: ReferenceCheckParams,
): { flags: ReferenceFlag[]; segments: ReferenceSegment[] } {
  const flags = findReferenceFlags(content, params);
  return { flags, segments: segmentContent(content, flags) };
}
