/**
 * Finds the best available mark for each college, preferring the institution's
 * own website, and normalises it into one predictable asset.
 *
 * Strategies are tried in order of quality, not convenience:
 *
 *   1. the header logo on the university's homepage — usually an SVG shield or
 *      wordmark, and the best asset most sites publish
 *   2. an inline `<svg>` in the header, extracted as a file
 *   3. icons declared by `<link rel="icon">`
 *   4. icons listed in the web app manifest, where the 192px and 512px
 *      versions usually live
 *   5. an official brand / identity / media-resources page
 *   6. the conventional `/apple-touch-icon.png` paths
 *   7. Wikidata's logo (P154) or seal (P158) via Wikimedia Commons — a
 *      *secondary* source, reported separately, used only when the
 *      university's own site yields nothing usable
 *
 * Each candidate is downloaded and normalised before being accepted, because a
 * declared size is only a claim and an `<img class="logo">` is sometimes a
 * photograph of a building. The first candidate that survives wins.
 *
 * Image files go to public/school-logos/ (gitignored) and the registry in
 * src/lib/school-logos.ts is rewritten, which shows as an uncommitted change.
 * See docs/school-logos.md on trademark before enabling or committing it.
 *
 *   npm run logos:fetch
 *   npm run logos:fetch -- brown yale      # only matching schools
 *   npm run logos:fetch -- --report        # also write the JSON audit trail
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { listCoveredSchoolNames, lookupSchoolSource } from "../src/lib/retrieval/registry.ts";
import { DECLINED_SCHOOLS, NO_USABLE_LOGO, SCHOOL_LOGOS as EXISTING } from "../src/lib/school-logos.ts";
import { markColour } from "../src/app/mark-palette.ts";
import { USABLE_ASPECT, normalizeLogo, type Normalized } from "./logo-normalize.mts";

const OUT_DIR = path.join(process.cwd(), "public", "school-logos");
const REGISTRY = path.join(process.cwd(), "src", "lib", "school-logos.ts");
const REPORT = path.join(process.cwd(), ".screenshots", "logo-audit.json");
const TODAY = new Date().toISOString().slice(0, 10);

const args = process.argv.slice(2);
const wantReport = args.includes("--report");
const filter = args.filter((a) => !a.startsWith("-")).map((a) => a.toLowerCase());
const DEBUG = process.env.LOGO_DEBUG === "1";

/**
 * An honest identifying agent, and a browser string for the WAFs that reject
 * anything else. Several universities 403 a non-browser agent outright, and
 * recording that as "publishes no logo" would be wrong, so the request is
 * retried once.
 */
const UA_HONEST = "college-essay-organizer/1.0 (+personal project; fetching each college's own logo)";
const UA_BROWSER = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/**
 * Explicit assets for schools whose recognisable mark is not what any automated
 * rule picks.
 *
 * Michigan is the case that motivated this: its site publishes a wordmark,
 * Wikidata's logo claim is a wordmark, and its infobox holds the engraved seal -
 * while the mark everyone actually knows is the block M. No scoring rule
 * derives that; a person just knows it.
 *
 * Tried before anything else. Keyed by the exact school name in the catalogue.
 */
const CURATED: Record<string, { url: string; note: string }> = {
  "University of Maryland, College Park": {
    url: "https://umd.edu/default/static/icons/favicon-256.png",
    note: "curated: Maryland's own 256px flag globe. Its apple-touch-icon serves the red athletics UMD lockup instead, and the full ringed seal's lettering is illegible at 44px",
  },
  "University of Michigan": {
    url: "https://commons.wikimedia.org/wiki/Special:FilePath/Michigan%20Wolverines%20logo.svg?width=640",
    note: "curated: the block M, which its own site and Wikidata both omit in favour of a wordmark",
  },
};

type Kind =
  | "header logo" | "inline svg" | "declared icon" | "manifest icon"
  | "brand page" | "conventional path" | "wikimedia" | "curated";

type Candidate = {
  kind: Kind;
  /** Lower is better. */
  rank: number;
  /** Either a URL to download, or literal bytes already in hand. */
  url?: string;
  inline?: Buffer;
  declaredOn: string;
  note?: string;
};

type Outcome = {
  school: string;
  status: "ok" | "initials" | "declined";
  origin?: "official" | "secondary";
  via?: string;
  domain?: string;
  sourceUrl?: string;
  detail: string;
  tried: number;
};

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

/** "admission.brown.edu" -> "brown.edu" */
function registrable(hostname: string): string {
  const labels = hostname.split(".");
  return labels.length <= 2 ? hostname : labels.slice(-2).join(".");
}

const sleep = (ms: number) => new Promise((resolve) => { setTimeout(resolve, ms); });

/**
 * Wikimedia's API asks for a descriptive agent and throttles generic browser
 * strings hard - a browser UA got "You are making too many requests" within a
 * handful of calls. So their endpoints get the honest agent only, and a pause.
 */
async function wikiGet(url: string, accept: string): Promise<Response> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await sleep(1200 + attempt * 2500);
    const response = await fetch(url, {
      redirect: "follow",
      headers: { "user-agent": UA_HONEST, accept },
      signal: AbortSignal.timeout(15_000),
    });
    if (response.ok) {
      // The throttle reply is a 200 with a plain-text body, not a status code.
      const clone = response.clone();
      const peek = (await clone.text()).slice(0, 40);
      if (!/too many requests/i.test(peek)) return response;
      continue;
    }
    if (![429, 503].includes(response.status)) throw new Error(`HTTP ${response.status}`);
  }
  throw new Error("wikimedia throttled");
}

async function get(url: string, accept: string, timeout = 15_000): Promise<Response> {
  if (/wikidata\.org|wikimedia\.org|wikipedia\.org/.test(url)) return wikiGet(url, accept);
  let last: unknown = new Error("unreachable");
  for (const agent of [UA_HONEST, UA_BROWSER]) {
    try {
      const response = await fetch(url, {
        redirect: "follow",
        headers: { "user-agent": agent, accept, "accept-language": "en-US,en;q=0.9" },
        signal: AbortSignal.timeout(timeout),
      });
      if (response.ok) return response;
      last = new Error(`HTTP ${response.status}`);
      // Only a block is worth retrying with the other agent.
      if (![401, 403, 405, 406, 429].includes(response.status)) throw last;
    } catch (error) {
      last = error;
    }
  }
  throw last;
}

const attr = (tag: string, name: string) =>
  new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, "i").exec(tag)?.[1];

const abs = (href: string, base: string) => {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
};

/**
 * `<img>` tags that look like the site's own logo.
 *
 * Scored rather than filtered: "shield" or "seal" in a filename is stronger
 * evidence than "logo" in a class, and an SVG beats a bitmap. Only the top of
 * the document is searched — a match in the footer or a news teaser is far
 * more likely to be a partner's mark than the university's own.
 */
function headerLogos(html: string, page: string): Candidate[] {
  const found: Candidate[] = [];
  const head = html.slice(0, 60_000);

  for (const [tag] of head.matchAll(/<img\b[^>]*>/gi)) {
    const src = attr(tag, "src") ?? attr(tag, "data-src");
    if (!src || src.startsWith("data:")) continue;
    const haystack = `${src} ${attr(tag, "alt") ?? ""} ${attr(tag, "class") ?? ""} ${attr(tag, "id") ?? ""}`.toLowerCase();
    if (!/logo|wordmark|shield|seal|crest|brandmark|lockup/.test(haystack)) continue;
    // Social and UI icons live in the header too, and a filename like
    // "instagram--brand.svg" reads as a brandmark to a naive matcher - UCLA's
    // card briefly showed the Instagram glyph because of exactly that.
    if (/sponsor|partner|advert|banner|hero|slide|payment|photo/.test(haystack)) continue;
    if (/instagram|facebook|twitter|tiktok|youtube|linkedin|snapchat|threads|whatsapp|reddit|flickr|vimeo|weibo|wechat/.test(haystack)) continue;
    if (/\bsocial\b|share-|icon-|sprite|avatar|placeholder/.test(haystack)) continue;
    // A fundraising campaign or an anniversary lockup is a temporary mark, not
    // the institution's. Washington and Lee's card showed "Leading Lives of
    // Consequence - The Campaign for Washington and Lee" because it outscored
    // the real logo.
    if (/campaign|anniversary|centennial|bicentennial|celebrat|giving|reunion|commencement|athletic/.test(haystack)) continue;
    // Brand pages also publish promotional tiles *containing* the logo. NYU's
    // card showed a "brand toolkit" graphic: correctly NYU, but a marketing
    // image rather than the mark.
    if (/toolkit|promo|guidelines|template|mockup|example|swatch|palette|poster|billboard/.test(haystack)) continue;

    const url = abs(src, page);
    if (!url) continue;
    let rank = 100;
    if (/\.svg(\?|$)/i.test(url)) rank -= 30;
    if (/shield|seal|crest/.test(haystack)) rank -= 10;
    // A horizontal lockup is usually too wide for a badge; prefer a mark.
    if (/wordmark|lockup/.test(haystack)) rank += 8;
    found.push({ kind: "header logo", rank, url, declaredOn: page, note: attr(tag, "alt") || undefined });
  }
  return found;
}

/** A logo inlined as `<svg>` markup, saved out as its own file. */
function inlineSvgLogos(html: string, page: string): Candidate[] {
  const found: Candidate[] = [];
  const head = html.slice(0, 60_000);
  for (const match of head.matchAll(/<svg\b[^>]*>[\s\S]{40,20000}?<\/svg>/gi)) {
    const markup = match[0];
    const opening = /<svg\b[^>]*>/i.exec(markup)?.[0] ?? "";
    const context = head.slice(Math.max(0, (match.index ?? 0) - 400), match.index ?? 0);
    const haystack = `${opening} ${context}`.toLowerCase();
    if (!/logo|wordmark|shield|seal|crest|brandmark/.test(haystack)) continue;
    if (/icon-|sprite|social|search|menu|hamburger|arrow|chevron|close/.test(haystack)) continue;
    if (/instagram|facebook|twitter|tiktok|youtube|linkedin|snapchat|threads/.test(haystack)) continue;
    if (/external|new-window|open-in|download|caret|expand|plus|minus/.test(haystack)) continue;
    // A UI glyph is one or two short paths; an institutional mark carries far
    // more geometry. UC Santa Barbara's brand page offered an external-link
    // arrow that satisfied every keyword test.
    const geometry = (markup.match(/<(path|polygon|polyline|circle|ellipse|rect|use)\b/gi) ?? []).length;
    if (markup.length < 700 && geometry < 3) continue;
    // It needs its namespaces to stand alone as a file. Inline markup inherits
    // them from the host document, so an extracted logo that uses <use
    // xlink:href> fails to parse without the xlink declaration added back.
    let standalone = markup;
    if (!/xmlns=/i.test(opening)) {
      standalone = standalone.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
    }
    if (/xlink:/i.test(standalone) && !/xmlns:xlink=/i.test(standalone)) {
      standalone = standalone.replace(/<svg\b/i, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
    }
    found.push({
      kind: "inline svg", rank: 75, inline: Buffer.from(standalone, "utf8"),
      declaredOn: page, note: "extracted from inline markup",
    });
  }
  return found;
}

function declaredIcons(html: string, page: string): Candidate[] {
  const found: Candidate[] = [];
  for (const [tag] of html.matchAll(/<link\b[^>]*>/gi)) {
    const rel = attr(tag, "rel")?.toLowerCase();
    if (!rel || !/\bicon\b|apple-touch-icon/.test(rel)) continue;
    // A Safari pinned-tab asset is monochrome by definition and renders as a
    // solid silhouette.
    if (rel.includes("mask-icon")) continue;
    const href = attr(tag, "href");
    if (!href) continue;
    const url = abs(href, page);
    if (!url) continue;
    const declared = Math.max(0, ...[...(attr(tag, "sizes") ?? "").matchAll(/(\d+)x(\d+)/gi)].map((m) => Number(m[1])));
    const size = /\.svg(\?|$)/i.test(url) ? 1024 : declared || (rel.includes("apple-touch-icon") ? 180 : 32);
    // 200 keeps icons ranked below a real header logo.
    found.push({ kind: "declared icon", rank: 200 - Math.min(size, 512) / 8, url, declaredOn: page });
  }
  return found;
}

async function manifestIcons(html: string, page: string): Promise<Candidate[]> {
  const tag = /<link\b[^>]*rel\s*=\s*["'][^"']*manifest[^"']*["'][^>]*>/i.exec(html)?.[0];
  const href = tag ? attr(tag, "href") : undefined;
  const manifestUrl = href ? abs(href, page) : null;
  if (!manifestUrl) return [];
  try {
    const manifest = JSON.parse(await (await get(manifestUrl, "application/json")).text());
    if (!Array.isArray(manifest.icons)) return [];
    return manifest.icons.flatMap((entry: { src?: string; sizes?: string }) => {
      const url = entry.src ? abs(entry.src, manifestUrl) : null;
      if (!url) return [];
      const size = Math.max(0, ...[...String(entry.sizes ?? "").matchAll(/(\d+)x(\d+)/gi)].map((m) => Number(m[1]))) || 64;
      return [{ kind: "manifest icon" as Kind, rank: 210 - Math.min(size, 512) / 8, url, declaredOn: manifestUrl }];
    });
  } catch {
    return [];
  }
}

/**
 * A university's brand or identity page, which is where the primary logo is
 * published as a download rather than as a 32px favicon.
 */
async function brandPageLogos(domain: string): Promise<Candidate[]> {
  const paths = [
    "/brand", "/identity", "/brand-guidelines", "/logos", "/logo",
    "/about/brand", "/marketing/brand", "/communications/brand",
    "/brand/logos", "/identity/logos", "/visual-identity", "/toolkit",
  ];
  for (const suffix of paths) {
    const page = `https://${domain}${suffix}`;
    try {
      const response = await get(page, "text/html", 9000);
      const html = await response.text();
      if (!/logo|identity|brand/i.test(html.slice(0, 4000))) continue;
      const found = [...headerLogos(html, response.url), ...inlineSvgLogos(html, response.url)]
        .map((candidate) => ({ ...candidate, kind: "brand page" as Kind, rank: candidate.rank - 5 }));
      if (found.length > 0) return found.slice(0, 6);
    } catch {
      // Most of these paths do not exist. That is expected, not an error.
    }
  }
  return [];
}

/**
 * Wikidata's logo (P154), falling back to seal (P158), resolved through
 * Wikimedia Commons.
 *
 * A secondary source: the identity is a third party's claim rather than the
 * institution's own publication, and Commons files carry their own licence
 * situation that this script does not attempt to adjudicate. Everything from
 * here is recorded as `origin: "secondary"` and reported separately.
 */
async function wikimediaLogos(school: string): Promise<Candidate[]> {
  const entity = await resolveEntity(school);
  if (!entity) return [];
  const api = async (params: Record<string, string>) => {
    const url = new URL("https://www.wikidata.org/w/api.php");
    url.search = new URLSearchParams({ format: "json", origin: "*", ...params }).toString();
    return (await (await get(url.toString(), "application/json")).json()) as Record<string, unknown>;
  };
  try {
    const found: Candidate[] = [];
    // Both properties are offered rather than preferring P154: Michigan's
    // "logo" is a wide wordmark while its "seal" is square, and which makes the
    // better 44px badge is a question for the scorer, not for this order.
    for (const [property, label, rank] of [["P158", "seal", 900], ["P154", "logo", 905]] as const) {
      const claims = (await api({ action: "wbgetclaims", entity, property }) as {
        claims?: Record<string, { mainsnak?: { datavalue?: { value?: unknown } } }[]>;
      })?.claims?.[property];
      const filename = claims?.[0]?.mainsnak?.datavalue?.value;
      if (typeof filename !== "string") continue;
      // A claim on the right entity can still point at the parent's mark.
      if (!namesSchool(filename, school)) {
        if (DEBUG) console.log(`        ~ ${property} ${filename} does not name ${school}`);
        continue;
      }
      found.push({
        kind: "wikimedia", rank,
        url: commonsFile(filename),
        declaredOn: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(filename.replace(/ /g, "_"))}`,
        note: `Wikidata ${entity} ${property} (${label}): ${filename}`,
      });
    }
    return found;
  } catch {
    return [];
  }
}

/**
 * The image in a college's English Wikipedia infobox, which is almost always
 * its official seal.
 *
 * Also a *secondary* source, but a far safer one than searching Commons: a
 * Commons full-text search for "Williams College seal" returns "Seal of Roger
 * Williams University", and for "Wesleyan University" it returns Ohio
 * Wesleyan's. Wrong-school marks are worse than initials, so identity is pinned
 * two ways here - the article title must match the school name exactly, and the
 * filename must contain the school's most distinctive word.
 */
async function wikipediaInfobox(school: string): Promise<Candidate[]> {
  const normalise = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const generic = new Set(["university", "college", "the", "of", "at", "and", "state", "institute", "school"]);
  // Any distinctive word, not just the longest: for the UC campuses the longest
  // is "california", which is shared with the system and with every sibling, so
  // "UC_Irvine_seal.svg" failed a check that should have passed. The article
  // title is already required to match exactly, so this is a second guard
  // rather than the only one.
  const distinctive = normalise(school).split(" ").filter((word) => word.length > 2 && !generic.has(word));
  if (distinctive.length === 0) return [];

  try {
    const page = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(school.replace(/ /g, "_"))}`;
    const summary = await (await get(page, "application/json")).json() as {
      title?: string; originalimage?: { source?: string };
    };
    if (!summary?.title || normalise(summary.title) !== normalise(school)) return [];
    const thumb = summary.originalimage?.source;
    if (!thumb) return [];

    const bare = thumb.split("?")[0];
    const viaThumb = /\/thumb\/[^/]+\/[^/]+\/([^/]+)\/\d+px-/.exec(bare)?.[1];
    const filename = decodeURIComponent(viaThumb ?? bare.split("/").pop()!);
    if (!namesSchool(filename, school)) return [];
    // Some infoboxes lead with a campus photograph rather than the seal.
    // Colour analysis catches most, but requiring the filename to name a mark
    // avoids downloading them at all - and avoids a near-miss slipping through.
    if (!/seal|logo|crest|shield|coat[_ ]of[_ ]arms|wordmark|arms/i.test(filename)) return [];

    // These seals are usually uploaded to English Wikipedia under a *non-free*
    // fair-use rationale rather than to Commons, which is why the Commons path
    // 404s for them - and is also exactly why they carry a licence warning. The
    // thumbnail URL the API already returned works whichever wiki hosts the
    // file, so it is used directly; a larger rendition is tried first.
    const wider = bare.replace(/\/(\d+)px-/, "/512px-");
    const note = `Wikipedia infobox: ${filename} - likely a non-free fair-use upload, verify before enabling`;
    const candidates: Candidate[] = [];
    if (wider !== bare) {
      candidates.push({
        kind: "wikimedia", rank: 888, url: wider,
        declaredOn: `https://en.wikipedia.org/wiki/${encodeURIComponent(school.replace(/ /g, "_"))}`,
        note,
      });
    }
    candidates.push({
      kind: "wikimedia", rank: 890, url: bare,
      declaredOn: `https://en.wikipedia.org/wiki/${encodeURIComponent(school.replace(/ /g, "_"))}`,
      note,
    });
    return candidates;
  } catch {
    return [];
  }
}

/**
 * A Commons download URL.
 *
 * `?width=` renders an SVG at any size, but for a bitmap Wikimedia can only
 * downscale - asking for 640px of a 447px PNG returns 404, which is what made
 * every infobox seal look unavailable.
 */
function commonsFile(filename: string): string {
  const base = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename)}`;
  return /\.svg$/i.test(filename) ? `${base}?width=640` : base;
}

const GENERIC_WORDS = new Set([
  "university", "college", "the", "of", "at", "and", "for", "state", "institute", "school",
]);

/**
 * Words that identify more than one school in the catalogue, and so identify
 * none of them. Filled in once the school list is known.
 *
 * "california" appears in seven campus names, so a file called "Seal of the
 * University of California" names no campus in particular. "wisconsin" appears
 * in exactly one, so "Seal of the University of Wisconsin" really is
 * Madison's mark.
 */
const ambiguousWords = new Set<string>();

function distinctiveWords(school: string): string[] {
  return school.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ")
    .filter((word) => word.length > 2 && !GENERIC_WORDS.has(word));
}

/**
 * Does this filename actually name *this* school?
 *
 * Wikidata's seal claim on Santa Barbara's own entity points at "Seal of the
 * University of California" - the system's mark, not the campus's - so trusting
 * the entity alone put the wrong institution on the card.
 */
/**
 * Short names a school is universally known by, which its catalogue name does
 * not contain.
 *
 * "Georgia Tech seal.svg" is unmistakably the Georgia Institute of Technology,
 * but every individual word in that catalogue name is shared with another
 * school ("georgia" with the University of Georgia, "technology" with MIT), so
 * the identity guard rejected it.
 */
const SCHOOL_ALIASES: Record<string, string[]> = {
  "Georgia Institute of Technology": ["georgiatech"],
  "Virginia Polytechnic Institute and State University": ["virginiatech", "virginiapolytechnic"],
  "Massachusetts Institute of Technology": ["mit"],
  "College of William & Mary": ["williamandmary", "williammary"],
};

function namesSchool(filename: string, school: string): boolean {
  const flat = filename.toLowerCase().replace(/[^a-z0-9]+/g, "");
  if ((SCHOOL_ALIASES[school] ?? []).some((alias) => flat.includes(alias))) return true;
  const distinctive = distinctiveWords(school);
  if (distinctive.length === 0) return true;

  // The whole name appearing in the filename settles it even when no single
  // word does: "boston" belongs to Boston College and Boston University alike,
  // and the acronym "BC" is too short to be safe, but
  // "Boston_College_seal.svg" is unmistakable.
  const whole = school.toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (flat.includes(whole)) return true;

  // Any word that belongs to this school alone is proof enough; the campus word
  // ("barbara", "madison") is usually the one that qualifies.
  if (distinctive.some((word) => !ambiguousWords.has(word) && flat.includes(word))) return true;

  // Or the acronym a campus is actually known by: UCLA, UCSC.
  const acronym = school.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ")
    .filter((word) => !["of", "and", "at", "the"].includes(word))
    .map((word) => word[0]).join("");
  return acronym.length >= 3 && flat.includes(acronym);
}

const normaliseName = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * The Wikidata entity for a school, verified by label.
 *
 * `wbsearchentities` with limit 1 happily returns the parent institution:
 * searching "University of California, Santa Barbara" matched the University of
 * California system, whose seal then landed on Santa Barbara's card. Requiring
 * the label or an alias to match exactly is what stops one campus wearing
 * another institution's mark.
 */
async function resolveEntity(school: string): Promise<string | null> {
  try {
    const url = new URL("https://www.wikidata.org/w/api.php");
    url.search = new URLSearchParams({
      action: "wbsearchentities", search: school, language: "en",
      type: "item", limit: "8", format: "json", origin: "*",
    }).toString();
    const results = (await (await get(url.toString(), "application/json")).json() as {
      search?: { id?: string; label?: string; aliases?: string[] }[];
    })?.search ?? [];
    const wanted = normaliseName(school);
    for (const result of results) {
      const names = [result.label ?? "", ...(result.aliases ?? [])].map(normaliseName);
      if (result.id && names.includes(wanted)) return result.id;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * The institution's own website, from Wikidata's official-website property.
 *
 * Needed because several records cite a *shared* application domain rather than
 * the college's own: Berkeley, UCLA, Irvine and Santa Barbara all cite
 * universityofcalifornia.edu, so scraping the cited domain gave four campuses
 * the identical UC system logo. Wikidata only supplies the address here - the
 * asset still comes from the university's own server, so it is still official.
 */
async function officialSiteDomain(school: string): Promise<string | null> {
  const entity = await resolveEntity(school);
  if (!entity) return null;
  try {
    const claims = new URL("https://www.wikidata.org/w/api.php");
    claims.search = new URLSearchParams({
      action: "wbgetclaims", entity, property: "P856", format: "json", origin: "*",
    }).toString();
    const site = (await (await get(claims.toString(), "application/json")).json() as {
      claims?: { P856?: { mainsnak?: { datavalue?: { value?: unknown } } }[] };
    })?.claims?.P856?.[0]?.mainsnak?.datavalue?.value;
    if (typeof site !== "string") return null;
    return registrable(new URL(site).hostname);
  } catch {
    return null;
  }
}

/** Homepage HTML for a domain, plus the URL it actually resolved to. */
async function loadHome(domain: string): Promise<{ html: string; url: string } | null> {
  for (const candidate of [`https://${domain}/`, `https://www.${domain}/`]) {
    try {
      const response = await get(candidate, "text/html");
      return { html: await response.text(), url: response.url };
    } catch {
      // Try the other form.
    }
  }
  return null;
}

const outcomes: Outcome[] = [];
const entries: string[] = [];

await mkdir(OUT_DIR, { recursive: true });

const allSchools = listCoveredSchoolNames()
  .map((name) => lookupSchoolSource(name))
  .filter((record): record is NonNullable<typeof record> => record !== null);

const schools = allSchools
  .filter((record) => filter.length === 0 || filter.some((f) => record.schoolName.toLowerCase().includes(f)));

// A domain cited by more than one school is a shared application or system
// site, and its header logo belongs to the system rather than to any one
// campus. Using it would put the UC system's mark on four different campuses.
// Computed over every researched school, never over the filtered subset: with
// only Santa Barbara in the run, "california" looked unique and the UC system
// seal passed the identity guard.
const citations = new Map<string, number>();
for (const record of allSchools) {
  if (!record.sourceUrl) continue;
  const key = registrable(new URL(record.sourceUrl).hostname);
  citations.set(key, (citations.get(key) ?? 0) + 1);
}
const shared = new Set([...citations].filter(([, count]) => count > 1).map(([key]) => key));

const wordCounts = new Map<string, number>();
for (const record of allSchools) {
  for (const word of new Set(distinctiveWords(record.schoolName))) {
    wordCounts.set(word, (wordCounts.get(word) ?? 0) + 1);
  }
}
for (const [word, count] of wordCounts) if (count > 1) ambiguousWords.add(word);
if (shared.size > 0) console.log(`shared domains, resolved per-school instead: ${[...shared].join(", ")}`);

console.log(`${schools.length} schools\n`);

for (const record of schools) {
  const school = record.schoolName;

  if (DECLINED_SCHOOLS.includes(school)) {
    outcomes.push({ school, status: "declined", detail: "on the declined list", tried: 0 });
    console.log(`  declined  ${school}`);
    continue;
  }
  if (NO_USABLE_LOGO.includes(school)) {
    outcomes.push({ school, status: "initials", detail: "no usable mark exists; recorded by hand", tried: 0 });
    console.log(`  initials  ${school} — recorded by hand: no usable mark exists`);
    continue;
  }
  if (!record.sourceUrl) {
    outcomes.push({ school, status: "initials", detail: "no cited source URL to derive a domain from", tried: 0 });
    console.log(`  initials  ${school} — no cited source URL`);
    continue;
  }

  const citedHost = new URL(record.sourceUrl).hostname;
  const cited = registrable(citedHost);
  const candidates: Candidate[] = [];

  // A curated choice is a human decision and is tried before anything else.
  const curated = CURATED[school];
  if (curated) {
    candidates.push({
      kind: "curated", rank: -100, url: curated.url,
      declaredOn: curated.url.split("?")[0], note: curated.note,
    });
  }

  // For a shared domain the cited site is nobody's mark in particular, so the
  // school's own site is looked up instead.
  const isShared = shared.has(cited);
  const own = isShared ? await officialSiteDomain(school) : null;
  const domain = own ?? cited;
  if (isShared && DEBUG) console.log(`        > ${cited} is shared; ${own ? `using ${own}` : "no own domain found"}`);

  // If the cited domain is shared and the school's own could not be found, its
  // site is skipped entirely rather than scraped. A throttled lookup must not
  // be able to put the UC system's wordmark on Berkeley's card - the worst
  // outcome here has to be initials, never another institution's mark.
  const home = isShared && !own
    ? null
    : (await loadHome(domain)
      ?? (domain === cited && citedHost !== cited ? await loadHome(citedHost) : null));
  if (home) {
    candidates.push(
      ...headerLogos(home.html, home.url),
      ...inlineSvgLogos(home.html, home.url),
      ...declaredIcons(home.html, home.url),
      ...(await manifestIcons(home.html, home.url)),
      { kind: "conventional path", rank: 400, url: `https://${domain}/apple-touch-icon.png`, declaredOn: `https://${domain}/` },
    );
  }

  type Scored = { candidate: Candidate; png: Buffer; norm: Normalized; score: number };
  const evaluated: Scored[] = [];
  let lastWhy = home ? "no candidate produced a usable mark" : "homepage unreachable";
  let tried = 0;

  /**
   * Lower is better.
   *
   * Aspect dominates, because the container is a 44px circle: Yale's 169x76
   * header wordmark is a better *logo* than its app icon and a worse *badge*,
   * and ranking by source alone picked the wordmark. Resolution and provenance
   * are tie-breakers.
   */
  const seen = new Set<string>();

  const quality = (candidate: Candidate, norm: Normalized): number => {
    // Aspect dominates: the container is a 44px circle, so a compact mark beats
    // a horizontal lockup however official the lockup is. Chicago's own site
    // serves a shield-plus-wordmark whose shield is a few pixels wide here.
    // 70 was too punishing: Purdue's bold P is 1.86 wide and scored 43 on
    // aspect alone, losing to a 120px fine-line seal. USABLE_ASPECT is the hard
    // gate; this only needs to express a preference.
    const aspect = Math.abs(Math.log(norm.aspect)) * 45;

    // Only genuinely small assets are penalised. 180px is already four times
    // the rendered size, and penalising it pushed good official icons below
    // encyclopedia seals for no visible benefit.
    // Steeper, and biting further up: a 120px seal was outscoring a 192px
    // official mark because anything above 128px was treated as equally good.
    // A 44px badge on a 2x display wants 88px minimum, and headroom above that
    // is what keeps it from looking soft.
    const scalable = /svg/i.test(norm.sourceFormat);
    const resolution = scalable ? 0 : Math.max(0, (200 - Math.min(norm.contentPx, 200)) / 3);

    // Ordered by how reliably each source yields the school's actual mark,
    // measured by inspecting the results rather than by how official it is.
    // Brand pages and inline SVGs produced the two worst grabs in this project
    // - a promotional tile and an external-link arrow - so they now rank below
    // an encyclopedia seal.
    // A curated choice is a human decision and outranks everything.
    if (candidate.rank === -100) return -1000;

    // Encyclopedia seals are indispensable for schools whose own site publishes
    // nothing compact, but they must not displace a crisp modern mark: dropping
    // this to 10 swapped Arizona State's bold ASU wordmark and Brandeis's blue B
    // for faint engraved seals, which is worse at 44px however authentic.
    const source = {
      curated: 0, "header logo": 0, "declared icon": 2, "manifest icon": 2,
      "conventional path": 6, wikimedia: 22, "inline svg": 26, "brand page": 28,
    }[candidate.kind];

    // A fine-line seal inks very little and reads as a smudge; a denser mark
    // wins where one exists, but a faint seal still beats initials.
    // The decisive test between a solid mark and an engraved seal. Fine-line
    // heraldry inks a few percent of its frame and reads as a grey smudge in a
    // 44px disc; a shield, monogram or wordmark inks a third of it. This is
    // weighted heavily because it predicts legibility better than any other
    // measure available here.
    const sparse = norm.ink < 0.20 ? (0.20 - norm.ink) * 260 : 0;
    return aspect + resolution + source + sparse + (norm.fullBleed ? -6 : 0);
  };

  const consider = async (pool: Candidate[], limit = 8) => {
    // Sites repeat their logo in several places, and six copies of one wordmark
    // used to fill the evaluation budget and starve the Wikipedia seal that
    // would have won. Dedupe first, then budget per pool rather than globally.
    const unique = pool.filter((candidate) => {
      const key = candidate.url ?? `inline:${candidate.inline?.byteLength}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    let attempts = 0;
    for (const candidate of unique.sort((a, b) => a.rank - b.rank)) {
      if (attempts >= limit) return;
      attempts += 1;
      tried += 1;
      try {
        const bytes = candidate.inline
          ?? Buffer.from(await (await get(candidate.url!, "image/*,*/*", 12_000)).arrayBuffer());
        if (bytes.byteLength === 0) { lastWhy = "empty file"; continue; }
        const ext = (candidate.url?.match(/\.(png|svg|jpe?g|webp|gif|ico)(\?|$)/i)?.[1] ?? "png").toLowerCase();
        // The colour ceiling exists to reject photographs and collages, and
        // those only ever arrive from a page's <img> tags. A favicon, an
        // apple-touch-icon or a manifest icon is a mark by definition - and
        // Maryland's own favicon *is* its colourful globe seal, which the
        // ceiling was throwing away. Likewise a Wikimedia file whose name says
        // "seal" is a seal, however many colours an engraving uses.
        const iconSource = ["declared icon", "manifest icon", "conventional path"].includes(candidate.kind);
        const named = iconSource || candidate.kind === "curated" || (candidate.kind === "wikimedia"
          && /seal|logo|crest|shield|coat[_ ]of[_ ]arms|arms/i.test(`${candidate.url} ${candidate.note ?? ""}`));
        const norm = await normalizeLogo(bytes, ext === "jpeg" ? "jpg" : ext, named);
        if (!norm.ok) {
          lastWhy = norm.why;
          if (DEBUG) console.log(`        x ${candidate.kind} ${candidate.url ?? "(inline)"} -> ${norm.why}`);
          continue;
        }
        evaluated.push({ candidate, png: norm.png, norm, score: quality(candidate, norm) });
      } catch (error) {
        lastWhy = error instanceof Error ? error.message.split("\n")[0] : String(error);
        if (DEBUG) console.log(`        x ${candidate.kind} ${candidate.url ?? "(inline)"} -> ${lastWhy}`);
        continue;
      }
      if (DEBUG) {
        const last = evaluated.at(-1);
        console.log(`        + ${candidate.kind} ${candidate.url ?? "(inline)"} -> score ${last?.score.toFixed(0)} aspect ${last?.norm.aspect.toFixed(2)}`);
      }
    }
  };

  const best = () => [...evaluated].sort((a, b) => a.score - b.score)[0];

  // Everything the university itself publishes.
  await consider(candidates, 10);
  // Then the encyclopedia marks, always - not only as a rescue. A university's
  // own site very often publishes a horizontal lockup and nothing compact,
  // while its Wikipedia infobox holds the seal or shield that is actually
  // recognisable at badge size. Letting the two compete on score is what fixed
  // Chicago, Maryland and Santa Barbara.
  await consider([...await wikimediaLogos(school), ...await wikipediaInfobox(school)], 6);
  // Brand pages are slow to probe and the least reliable, so only on a miss.
  if (!best()) await consider(await brandPageLogos(domain));

  // The best *usable* candidate, not merely the best-scoring one. Checking only
  // the top score threw away Pomona's perfectly square seal because a wider
  // wordmark happened to score better and then failed the gate.
  const usable = (entry: Scored) =>
    entry.norm.aspect <= USABLE_ASPECT && entry.norm.aspect >= 1 / USABLE_ASPECT;
  const accepted = [...evaluated].sort((a, b) => a.score - b.score).find(usable) ?? null;
  const winner = best();
  if (winner && !accepted) {
    lastWhy = `best available is ${winner.norm.aspect.toFixed(1)}:1 (${winner.candidate.kind}), too wide to read at 44px`;
  }

  if (!accepted) {
    outcomes.push({ school, status: "initials", detail: lastWhy, tried, domain });
    console.log(`  initials  ${school} — ${lastWhy}`);
    continue;
  }

  const { candidate, png, norm } = accepted;
  // Provenance follows where the bytes actually came from, not which strategy
  // found them: Maryland's curated asset is served by umd.edu and so is
  // official, while Michigan's comes from Wikimedia and is not.
  const host = new URL(candidate.url ?? candidate.declaredOn).hostname;
  const thirdParty = /wikimedia\.org|wikipedia\.org|wikidata\.org/.test(host);
  const origin: "official" | "secondary" = thirdParty ? "secondary" : "official";
  const slug = slugify(school);
  for (const ext of ["svg", "ico", "jpg", "webp", "gif"]) {
    await rm(path.join(OUT_DIR, `${slug}.${ext}`), { force: true });
  }
  await writeFile(path.join(OUT_DIR, `${slug}.png`), png);

  const fields = [
    `    school: ${JSON.stringify(school)},`,
    `    file: ${JSON.stringify(`/school-logos/${slug}.png`)},`,
    `    origin: ${JSON.stringify(origin)},`,
    `    declaredOn: ${JSON.stringify(candidate.declaredOn)},`,
    `    sourceUrl: ${JSON.stringify(candidate.url ?? candidate.declaredOn)},`,
    `    via: ${JSON.stringify(candidate.kind)},`,
    `    domain: ${JSON.stringify(domain)},`,
    `    fullBleed: ${norm.fullBleed},`,
    `    aspect: ${Number(norm.aspect.toFixed(3))},`,
    `    contentPx: ${norm.contentPx},`,
    `    sourceFormat: ${JSON.stringify(norm.sourceFormat)},`,
    `    sourceSize: ${JSON.stringify(norm.sourceSize)},`,
    `    sha256: ${JSON.stringify(createHash("sha256").update(png).digest("hex"))},`,
    `    retrievedAt: ${JSON.stringify(TODAY)},`,
  ];
  // A white mark on a white disc is invisible, so it gets the school's own
  // vetted palette colour as a plate - the same colour its initials would have
  // used, which keeps the fallback and the logo visually related.
  if (norm.light) {
    fields.push(`    render: { background: ${JSON.stringify(markColour(school))} },`);
  }
  const notes = [candidate.note, norm.light ? "light mark: rendered on a dark plate" : ""]
    .filter(Boolean).join(" | ");
  if (notes) fields.push(`    note: ${JSON.stringify(notes.slice(0, 220))},`);
  entries.push(`  {\n${fields.join("\n")}\n  },`);

  outcomes.push({
    school, status: "ok", origin, via: candidate.kind, domain,
    sourceUrl: candidate.url ?? candidate.declaredOn,
    detail: `${norm.sourceSize} ${norm.sourceFormat}, ${norm.fullBleed ? "full-bleed" : "inset"}, aspect ${norm.aspect.toFixed(2)}`,
    tried,
  });
  console.log(`  ${origin === "official" ? "ok      " : "wiki    "}  ${school} — ${candidate.kind}, ${norm.sourceSize} ${norm.sourceFormat}`);
}

// Rewrite only the array literal, leaving the file's documentation intact.
//
// A narrowed run must not wipe the schools it did not visit: `logos:fetch --
// emory` should fix Emory and leave the other 99 alone, so previous entries are
// carried over unless this run had something to say about them.
const source = await readFile(REGISTRY, "utf8");
const marker = "export const SCHOOL_LOGOS: readonly SchoolLogo[] = ";
const start = source.indexOf(marker);
if (start === -1) throw new Error("could not find SCHOOL_LOGOS in school-logos.ts");
const end = source.indexOf("\n\n", start);

const visited = new Set(schools.map((record) => record.schoolName));
// Carried-over entries are re-emitted in the same shape as fresh ones, so the
// file does not end up half TypeScript shorthand and half JSON.
const kept = EXISTING
  .filter((logo) => !visited.has(logo.school))
  .map((logo) => {
    const lines = (Object.entries(logo) as [string, unknown][])
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => `    ${key}: ${JSON.stringify(value)},`);
    return `  {\n${lines.join("\n")}\n  },`;
  });
const merged = [...entries, ...kept]
  // Alphabetical, so a diff of the registry is readable.
  .sort((a, b) => a.localeCompare(b));

await writeFile(
  REGISTRY,
  source.slice(0, start)
  + (merged.length > 0 ? `${marker}[\n${merged.join("\n")}\n];` : `${marker}[];`)
  + source.slice(end),
);
if (kept.length > 0) console.log(`\ncarried over ${kept.length} school(s) this run did not visit`);

if (wantReport) {
  await mkdir(path.dirname(REPORT), { recursive: true });
  await writeFile(REPORT, `${JSON.stringify(outcomes, null, 2)}\n`);
  console.log(`\naudit trail: ${path.relative(process.cwd(), REPORT)}`);
}

const official = outcomes.filter((o) => o.status === "ok" && o.origin === "official").length;
const secondary = outcomes.filter((o) => o.status === "ok" && o.origin === "secondary").length;
const initials = outcomes.filter((o) => o.status === "initials").length;
console.log(`\n${official + secondary} of ${schools.length} resolved — ${official} official, ${secondary} secondary; ${initials} on initials.`);
console.log("Files are gitignored; src/lib/school-logos.ts is modified. See docs/school-logos.md.");
