import Image from "next/image";

import { logoForSchool } from "@/lib/school-logos";
import { photoForSchool } from "@/lib/school-photos";

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
  const words = name
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

/**
 * Presentational: the school's name is always rendered as text beside this, so
 * announcing the initials would make a screen reader say the name twice.
 *
 * A registered photograph replaces the initials; the mark's colour stays as the
 * tinted placeholder underneath, so the reserved circle never flashes empty
 * while the image loads. Schools without a photograph - currently all of them -
 * show the mark, which is a finished state rather than a gap.
 */
export function SchoolMark({ name, small }: { name: string; small?: boolean }) {
  // A logo outranks a photograph at this size: in a 44px circle an institutional
  // mark is legible and a campus scene is mush. Both are off by default, so in
  // practice this renders initials - see src/lib/school-logos.ts.
  const logo = logoForSchool(name);
  const photo = logo ? undefined : photoForSchool(name);
  const size = small ? 30 : 44;
  const image = logo ?? photo;

  return (
    <span
      className={`mark${small ? " small" : ""}${logo ? " mark-logo" : ""}`}
      // A logo sits on white so a transparent PNG does not pick up the mark
      // colour behind it; the colour stays as the placeholder for a photograph.
      style={logo ? undefined : { background: markColour(name), color: "#fff" }}
      aria-hidden="true"
    >
      {image ? (
        <Image
          src={image.file}
          alt=""
          width={size}
          height={size}
          sizes={`${size}px`}
          style={photo ? { objectPosition: photo.focus } : undefined}
          // A logo is a fixed asset with no responsive variants worth
          // generating at 44px, and several are SVG.
          unoptimized={Boolean(logo)}
        />
      ) : (
        schoolInitials(name)
      )}
    </span>
  );
}
