// Extracted from school-mark.tsx so that scripts and tests can import it:
// Node's type stripping does not handle .tsx, and the contact-sheet script
// needs the same colours and initials the app renders.

/**
 * A college's identity mark: initials on one of twelve curated colours.
 *
 * The colours are a fixed, vetted list rather than a hue derived from the
 * name. A free hue can land anywhere, including somewhere illegible; every
 * entry here is pre-verified to carry white initials at WCAG AA and to sit at
 * 3:1 against the card surface, so the circle's edge shows without a border.
 * src/app/contrast.test.ts asserts both, so a colour cannot be added to this
 * list without being checked.
 *
 * Selection is `hash(name) % 12`: deterministic, so a college keeps its colour
 * between renders and between sessions.
 */
export const MARK_COLOURS = [
  "#2f6440", // moss - the brand colour, so the set reads as one family
  "#1f4e5f", // deep teal
  "#7a322d", // oxblood
  "#463a75", // indigo
  "#6b4a12", // bronze
  "#2b5578", // steel blue
  "#5c2f52", // plum
  "#3e5b2a", // olive
  "#8a3e17", // burnt orange
  "#1e4d3c", // pine
  "#6e2f3e", // maroon
  "#39456b", // slate navy
] as const;

// Words that appear in so many college names that they carry no identity.
const GENERIC = new Set([
  "university",
  "college",
  "institute",
  "school",
  "the",
  "of",
  "at",
  "and",
  "for",
]);

/** Deterministic and stable across processes - not Math.random, not an index. */
function hash(value: string): number {
  let total = 0;
  for (let index = 0; index < value.length; index += 1) {
    total = (total * 31 + value.charCodeAt(index)) % 0xffffffff;
  }
  return total;
}

/**
 * "New York University" -> NY, "University of Pennsylvania" -> Pe.
 *
 * Naive first-two-initials would render half the catalogue as "U" because so
 * many names begin "University of", so the generic words are dropped first. A
 * single distinctive word gives two letters rather than one, which keeps Brown
 * and Boston apart.
 */
export function schoolInitials(name: string): string {
  // A comma separates the institution from the campus, and the campus is what
  // identifies it: "University of California, Santa Barbara" is SB, not CS.
  const campus = name.includes(",") ? name.slice(name.indexOf(",") + 1) : name;
  const words = campus
    .split(/[\s,–—-]+/)
    .map((word) => word.replace(/[^A-Za-z]/g, ""))
    .filter(Boolean);
  const distinctive = words.filter((word) => !GENERIC.has(word.toLowerCase()));
  const source = distinctive.length > 0 ? distinctive : words;

  if (source.length === 0) return name.slice(0, 2).toUpperCase();
  if (source.length === 1) {
    const word = source[0];
    return (word[0] + (word[1] ?? "")).replace(/^./, (first) => first.toUpperCase());
  }
  return (source[0][0] + source[1][0]).toUpperCase();
}

export function markColour(name: string): string {
  return MARK_COLOURS[hash(name) % MARK_COLOURS.length];
}
