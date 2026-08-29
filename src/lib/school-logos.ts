/**
 * College logos, and the reason this is off by default.
 *
 * ## This is trademark, not copyright
 *
 * There is no such thing as a freely-licensed university logo. Photographs can
 * be CC0; a logo cannot, because it is a trademark rather than merely a
 * copyrighted image. Wikipedia's university logos are uploaded under *non-free*
 * fair-use rationales that do not extend to a product like this one.
 *
 * So unlike `school-photos.ts`, there is no licence to record. The question is
 * whether the use needs permission at all. Using a mark purely to *identify*
 * an institution, at identification size, without implying endorsement, is the
 * nominative-use argument that college-search products generally rely on.
 *
 * **This is not legal advice, and nothing here establishes that the use is
 * permitted.** Most universities' brand guidelines prohibit third-party use
 * outright, and admissions-adjacent products are the category they police most
 * actively. That is why the default is off.
 *
 * ## What makes this safer than the photo problem
 *
 * Identity comes free. The hard part with a campus photograph was proving the
 * image actually shows the campus it claims to. A logo fetched from the
 * university's *own domain* — derived from the official admissions URL this
 * repo already cites for that school's prompts — is that university's mark by
 * construction. There is no misattribution risk.
 *
 * ## How it is kept from shipping by accident
 *
 * Three independent gates, any one of which is enough:
 *
 * 1. `SHOW_SCHOOL_LOGOS` is unset in production, so `logosEnabled()` is false
 *    and `SchoolMark` renders generated initials.
 * 2. `SCHOOL_LOGOS` is empty in the committed source. `scripts/fetch-school-logos.mts`
 *    rewrites this array locally, which shows up as an uncommitted change —
 *    a visible decision rather than a silent one.
 * 3. `public/school-logos/` is gitignored, so the image files are never
 *    committed and never reach a deployment even if the flag were set.
 *
 * @see docs/school-logos.md
 */

/**
 * Schools that have asked not to be shown, or that a human has decided not to
 * show. The fetch script skips these, and `logoForSchool` refuses them even if
 * a stale entry survives in the registry — a removal request should not depend
 * on remembering to re-run a script.
 */
export const DECLINED_SCHOOLS: readonly string[] = [];

export type SchoolLogo = {
  /** Must match the school name the app renders. */
  school: string;
  /** Path under public/, e.g. "/school-logos/brown-university.png". */
  file: string;
  /** Intrinsic size. 0×0 for an SVG, which has no fixed pixel size. */
  width: number;
  height: number;
  /**
   * The university's own domain the asset came from. This is what makes the
   * mark attributable: it is served by the institution itself.
   */
  domain: string;
  /** The page whose <link rel="icon"> declared this asset. */
  declaredOn: string;
  /** The absolute URL the file was downloaded from. */
  sourceUrl: string;
  /** The rel attribute that declared it, e.g. "apple-touch-icon". */
  rel: string;
  /** sha256 of the bytes, so a silent upstream change is detectable. */
  sha256: string;
  /** ISO date the file was retrieved. */
  retrievedAt: string;
};

/**
 * Empty in the committed source. Populated locally by
 * `npm run logos:fetch`; see the gates above.
 */
export const SCHOOL_LOGOS: readonly SchoolLogo[] = [];

/**
 * Off unless explicitly switched on. Read at render time on the server, so
 * turning it on is a deployment configuration change and never a code change.
 */
export function logosEnabled(): boolean {
  return process.env.SHOW_SCHOOL_LOGOS === "1";
}

export function logoForSchool(name: string): SchoolLogo | undefined {
  if (!logosEnabled()) return undefined;
  if (DECLINED_SCHOOLS.includes(name)) return undefined;
  return SCHOOL_LOGOS.find((logo) => logo.school === name);
}
