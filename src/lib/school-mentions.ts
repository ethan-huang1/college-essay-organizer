// Finds the schools an essay actually names, so reuse risk does not depend on
// the student having remembered to fill in a "school-specific phrases" field.
//
// That field defaults to empty, which made schoolSpecificityRisk return "low"
// for every essay - so an essay opening "Stanford's design school is why I
// applied" was offered for another university's "why us" prompt with no
// warning at all. The field stays, as an override for phrases no name-match
// could find ("the Farm", "Hoya Saxa").

/**
 * Short forms that are unambiguous enough to match on their own.
 *
 * Deliberately conservative. Matching bare words from a school's full name
 * would flag "brown paper", a student named Rice, or an essay about washing
 * dishes at Duke's Diner - false positives here are worse than misses, because
 * a wrong high-risk warning tells a student to rewrite an essay that was fine.
 */
const SHORT_NAMES = new Map<string, string>([
  ["penn", "University of Pennsylvania"],
  ["upenn", "University of Pennsylvania"],
  ["mit", "Massachusetts Institute of Technology"],
  ["caltech", "California Institute of Technology"],
  ["ucla", "University of California, Los Angeles"],
  ["nyu", "New York University"],
  ["usc", "University of Southern California"],
  ["ucsd", "University of California, San Diego"],
  ["unc", "University of North Carolina at Chapel Hill"],
  ["cmu", "Carnegie Mellon University"],
  ["bu", "Boston University"],
  ["bc", "Boston College"],
  ["wustl", "Washington University in St. Louis"],
  ["rpi", "Rensselaer Polytechnic Institute"],
  ["gwu", "George Washington University"],
  ["sfs", "Walsh School of Foreign Service"],
]);

/**
 * Words too generic to identify a school on their own, so a full name is only
 * matched whole rather than by any one of its words.
 */
const GENERIC_WORDS = new Set([
  "university", "college", "institute", "school", "of", "the", "and", "at", "state",
  "technology", "polytechnic", "academy", "a", "for", "in", "north", "south", "east", "west",
]);

export function escapeForRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The distinctive part of a school's name: "Stanford University" -> "Stanford",
 * "University of California, Berkeley" -> "California, Berkeley".
 *
 * Returned only when it is long enough to be meaningful on its own, so a school
 * whose name is all generic words is matched by its full name only.
 */
function distinctiveName(schoolName: string) {
  const words = schoolName.split(/[\s,]+/).filter(Boolean);
  const distinctive = words.filter((word) => !GENERIC_WORDS.has(word.toLowerCase()));
  if (distinctive.length === 0) return null;
  const candidate = distinctive.join(" ");
  return candidate.length >= 4 ? candidate : null;
}

/**
 * A one-word school name is often an ordinary English word - Brown, Rice,
 * Wake, Smith, Reed - so matching it case-insensitively flags "brown paper"
 * and "rice and beans". Requiring the capital costs almost nothing, because
 * students capitalise the schools they are writing about, and a miss here only
 * withholds a warning while a false positive tells someone to rewrite an essay
 * that was fine.
 */
function needsCapital(distinctive: string) {
  return !distinctive.includes(" ");
}

/**
 * Single-word school names that are also ordinary English words.
 *
 * For these the capital proves nothing by itself, because the first word of a
 * sentence or a title is capitalised whatever it means: "Brown paper covered
 * the table." and an essay titled "Rice and Identity" were both being read as
 * naming a school. Since reuse.ts feeds in `${title} ${content}`, the title's
 * first word is always in that position.
 *
 * Every entry is the distinctive name of a real school in the catalogue, so the
 * list is closed rather than open-ended: Brown, Rice, Smith, Reed, Duke,
 * Williams, Trinity, Wake.
 */
const AMBIGUOUS_SINGLE_WORDS = new Set([
  "brown", "rice", "smith", "reed", "duke", "williams", "trinity", "wake", "hope", "union",
]);

type Occurrence = { start: number; end: number; matchedText: string };

/**
 * Every place `needle` appears as a whole word, with its exact span.
 *
 * Case-sensitive by default, matching the original boolean-only version this
 * generalises (its one caller, `locateAmbiguousName`, always passed an
 * already-capitalised `distinctive` name). Callers matching case-insensitively
 * (full school names, short forms) pass `caseSensitive: false` explicitly.
 */
function occurrences(text: string, needle: string, caseSensitive = true): Occurrence[] {
  const pattern = new RegExp(`\\b${escapeForRegExp(needle)}\\b`, caseSensitive ? "g" : "gi");
  const found: Occurrence[] = [];
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    found.push({ start: match.index, end: match.index + match[0].length, matchedText: match[0] });
  }
  return found;
}

/** True when this occurrence opens the text or a new sentence. */
function opensSentence(text: string, index: number) {
  const before = text.slice(0, index).replace(/[\s"'“‘(\[]+$/u, "");
  return before.length === 0 || /[.!?:;—–\n\r]$/.test(before);
}

/**
 * An ambiguous name counts only where its capital carries information: not at
 * the start of a sentence or title, or else followed by a possessive, since an
 * ordinary noun does not open a sentence as "Brown's".
 */
/** Ambiguous-name occurrences whose capital actually carries information. */
function locateAmbiguousName(text: string, needle: string): Occurrence[] {
  return occurrences(text, needle).filter((occurrence) => {
    if (!opensSentence(text, occurrence.start)) return true;
    return /^['’]s\b/.test(text.slice(occurrence.end));
  });
}

export type SchoolMentionLocation = { schoolName: string; start: number; end: number; matchedText: string };

/**
 * Every place `text` appears to name a school from `schoolNames`, with the
 * exact span of each occurrence - the positional counterpart to
 * `detectSchoolMentions`, for callers that need to highlight what was found
 * rather than just list which schools were named.
 */
export function locateSchoolMentions(text: string, schoolNames: readonly string[]): SchoolMentionLocation[] {
  if (!text.trim()) return [];
  const found: SchoolMentionLocation[] = [];

  for (const schoolName of schoolNames) {
    const fullNameHits = occurrences(text, schoolName, false);
    if (fullNameHits.length > 0) {
      for (const hit of fullNameHits) found.push({ schoolName, ...hit });
      continue;
    }
    const distinctive = distinctiveName(schoolName);
    if (!distinctive) continue;
    const ambiguous = needsCapital(distinctive) && AMBIGUOUS_SINGLE_WORDS.has(distinctive.toLowerCase());
    const hits = ambiguous
      ? locateAmbiguousName(text, distinctive)
      : occurrences(text, distinctive, needsCapital(distinctive));
    for (const hit of hits) found.push({ schoolName, ...hit });
  }

  // Short forms are checked against the caller's school list too: flagging
  // "UCLA" is only useful if UCLA is a school the student might reuse for.
  for (const [shortName, fullName] of SHORT_NAMES) {
    const hits = occurrences(text, shortName, false);
    if (hits.length === 0) continue;
    const match = schoolNames.find((name) => name === fullName);
    if (!match) continue;
    for (const hit of hits) found.push({ schoolName: match, ...hit });
  }

  return found;
}

/**
 * Every school from `schoolNames` that `text` appears to name, plus any
 * unambiguous short form it uses.
 *
 * Returns the canonical school names, which is what scoreMatch compares
 * against, so a detected mention behaves exactly like one the student typed.
 */
export function detectSchoolMentions(text: string, schoolNames: readonly string[]): string[] {
  return [...new Set(locateSchoolMentions(text, schoolNames).map((mention) => mention.schoolName))];
}

/**
 * The schools named across an essay's separate fields.
 *
 * Each field is analysed independently and the results unioned, because a
 * field boundary IS a sentence boundary. Concatenating title and body with a
 * space was what defeated the ambiguous-word guard in production: an essay
 * titled "Brown paper and the kitchen table" whose body opened "Brown paper
 * covered the table." put that second "Brown" mid-sentence, so it read as a
 * proper noun and the essay was reported as naming Brown University.
 *
 * Analysing fields separately is structural rather than a separator trick, so
 * it cannot be defeated by whatever punctuation a title happens to end with.
 */
export function detectSchoolMentionsIn(
  fields: { title?: string; body?: string },
  schoolNames: readonly string[],
): string[] {
  const parts = [fields.title ?? "", fields.body ?? ""];
  const found = new Set<string>();
  for (const part of parts) {
    for (const name of detectSchoolMentions(part, schoolNames)) found.add(name);
  }
  return [...found];
}
