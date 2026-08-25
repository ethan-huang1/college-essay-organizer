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

function escapeForRegExp(value: string) {
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

function mentions(text: string, needle: string, caseSensitive = false) {
  // Word-boundary matched so "Penn" does not fire inside "Pennsylvania" and
  // "Rice" does not fire inside "prices".
  return new RegExp(`\\b${escapeForRegExp(needle)}\\b`, caseSensitive ? "" : "i").test(text);
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

/** Every index at which `needle` appears as a whole word. */
function occurrences(text: string, needle: string) {
  const pattern = new RegExp(`\\b${escapeForRegExp(needle)}\\b`, "g");
  const found: number[] = [];
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) found.push(match.index);
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
function mentionsAmbiguousName(text: string, needle: string) {
  return occurrences(text, needle).some((index) => {
    if (!opensSentence(text, index)) return true;
    return /^['’]s\b/.test(text.slice(index + needle.length));
  });
}

/**
 * Every school from `schoolNames` that `text` appears to name, plus any
 * unambiguous short form it uses.
 *
 * Returns the canonical school names, which is what scoreMatch compares
 * against, so a detected mention behaves exactly like one the student typed.
 */
export function detectSchoolMentions(text: string, schoolNames: readonly string[]): string[] {
  if (!text.trim()) return [];
  const found = new Set<string>();

  for (const schoolName of schoolNames) {
    if (mentions(text, schoolName)) {
      found.add(schoolName);
      continue;
    }
    const distinctive = distinctiveName(schoolName);
    if (!distinctive) continue;
    const ambiguous = needsCapital(distinctive) && AMBIGUOUS_SINGLE_WORDS.has(distinctive.toLowerCase());
    const hit = ambiguous
      ? mentionsAmbiguousName(text, distinctive)
      : mentions(text, distinctive, needsCapital(distinctive));
    if (hit) found.add(schoolName);
  }

  // Short forms are checked against the caller's school list too: flagging
  // "UCLA" is only useful if UCLA is a school the student might reuse for.
  for (const [shortName, fullName] of SHORT_NAMES) {
    if (!mentions(text, shortName)) continue;
    const match = schoolNames.find((name) => name === fullName);
    if (match) found.add(match);
  }

  return [...found];
}
