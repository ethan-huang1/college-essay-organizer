/**
 * Campus photographs, and the provenance every one of them must carry.
 *
 * The registry is deliberately shaped so an entry cannot exist without its
 * metadata: `SchoolPhoto` has no optional provenance fields, so TypeScript
 * rejects a photograph added without a creator, a source page, an exact licence
 * and the credit line that licence requires.
 *
 * What that does and does not establish: `school-photos.test.ts` verifies the
 * metadata is present, internally consistent, and that the file exists at the
 * declared dimensions. **It cannot prove legal usability.** Completeness is not
 * permission. A human reviews each source before it is added.
 *
 * Sourcing rules, from the redesign plan:
 *
 * - Prefer clear, commercial-use-friendly licences: CC0 / public domain,
 *   Unsplash, Pexels, or straightforward CC BY.
 * - Avoid CC BY-SA and other licences with propagating conditions unless the
 *   conditions are genuinely handled.
 * - Never use Google Images results, social-media images, editorial-only
 *   images, or images from university sites without explicit permission.
 * - **If an image's identity, source, licence or suitability is uncertain, use
 *   the generated mark instead.** A mark is a perfectly good outcome; a
 *   photograph captioned with the wrong campus is not.
 */
export type SchoolPhoto = {
  /** Must match a school name the app can actually render. */
  school: string;
  /** Path under public/, e.g. "/school-photos/brown-university.webp". */
  file: string;
  /** Intrinsic size, so the box can be reserved and nothing reflows. */
  width: number;
  height: number;
  /** object-position; campus photographs are usually sky-heavy. */
  focus: string;
  /**
   * null means "presentational on purpose". A photo beside the school's name
   * is decorative: announcing "photo of Brown University campus" and then
   * "Brown University" says it twice.
   */
  alt: string | null;
  creator: string;
  /** The page the image was found on, not a CDN URL. */
  sourcePage: string;
  /** Exact licence name, e.g. "CC0 1.0" or "Unsplash License". */
  license: string;
  licenseUrl: string;
  /** The credit line as the licence requires it to appear. */
  attribution: string;
  /** e.g. "cropped to 16:9, resized to 800px wide". */
  modifications: string;
  /** ISO date the file was retrieved. */
  retrievedAt: string;
};

/**
 * No photographs are registered.
 *
 * The machinery around this list is complete and tested: add an entry and the
 * school card renders the photograph, the credit appears on the Photo Credits
 * page, and the tests check the file and its metadata. It is empty because
 * identifying a specific named campus in a specific image, and confirming its
 * licence, is a human verification step - and the rule above says an uncertain
 * image loses to the generated mark. Every school currently shows its mark,
 * which is a deliberate finished state rather than a placeholder.
 */
export const SCHOOL_PHOTOS: readonly SchoolPhoto[] = [];

export function photoForSchool(name: string): SchoolPhoto | undefined {
  return SCHOOL_PHOTOS.find((photo) => photo.school === name);
}
