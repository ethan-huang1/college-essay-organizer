/**
 * Downloads each college's own icon from its own domain, for local use.
 *
 * The domain is derived from the official admissions URL this repo already
 * cites as the source for that school's prompts, so the asset comes from the
 * institution itself — no third-party logo service, no guessing which image
 * belongs to which college, and no chance of attributing one school's mark to
 * another.
 *
 * Writes image files to public/school-logos/ (gitignored) and rewrites the
 * SCHOOL_LOGOS array in src/lib/school-logos.ts, which will then show as an
 * uncommitted change. That is deliberate: see the trademark discussion at the
 * top of that file before committing it or enabling SHOW_SCHOOL_LOGOS.
 *
 *   npm run logos:fetch            # every school in the registry
 *   npm run logos:fetch -- brown   # only schools whose name matches "brown"
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { listCoveredSchoolNames, lookupSchoolSource } from "../src/lib/retrieval/registry.ts";
import { DECLINED_SCHOOLS } from "../src/lib/school-logos.ts";

const OUT_DIR = path.join(process.cwd(), "public", "school-logos");
const REGISTRY = path.join(process.cwd(), "src", "lib", "school-logos.ts");
const TODAY = new Date().toISOString().slice(0, 10);
const UA = "college-essay-organizer/1.0 (personal project; fetching each college's own site icon)";

const filter = process.argv.slice(2).filter((arg) => !arg.startsWith("-")).map((a) => a.toLowerCase());

/** "admission.brown.edu" -> "brown.edu". Registrable domain, not the subdomain. */
function registrableDomain(hostname: string): string {
  const labels = hostname.split(".");
  return labels.length <= 2 ? hostname : labels.slice(-2).join(".");
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

type Candidate = { url: string; rel: string; sizes: number };

/**
 * Picks the best icon a page declares.
 *
 * Preference order is by usable resolution: an SVG scales to any size, then the
 * largest declared pixel size. A 16×16 favicon is useless for a 44px mark on a
 * 2× display, which is why the naive /favicon.ico guess was abandoned.
 */
function declaredIcons(html: string, pageUrl: string): Candidate[] {
  const candidates: Candidate[] = [];
  for (const [tag] of html.matchAll(/<link\b[^>]*>/gi)) {
    const rel = /rel\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase();
    if (!rel || !/\bicon\b|apple-touch-icon/.test(rel)) continue;
    // mask-icon is a Safari pinned-tab asset and is monochrome by definition:
    // it renders as a solid silhouette, which is worse than the generated mark
    // it would replace. Brown resolved to one of these before this guard.
    if (rel.includes("mask-icon")) continue;
    const href = /href\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    if (!href) continue;
    const sizesAttr = /sizes\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1] ?? "";
    const declared = Math.max(0, ...[...sizesAttr.matchAll(/(\d+)x(\d+)/gi)].map((m) => Number(m[1])));
    const isSvg = /\.svg(\?|$)/i.test(href) || /image\/svg/i.test(tag);
    try {
      candidates.push({
        url: new URL(href, pageUrl).toString(),
        rel,
        // SVG wins outright; apple-touch-icon is conventionally 180px even when
        // it declares no size, so it beats an undeclared favicon.
        sizes: isSvg ? 10_000 : declared || (rel.includes("apple-touch-icon") ? 180 : 32),
      });
    } catch {
      // A malformed href is not worth failing the whole run over.
    }
  }
  return candidates;
}

/**
 * Icons declared in a web app manifest rather than in the HTML.
 *
 * Many sites declare only a 16px favicon in their markup and put the 192px and
 * 512px versions here, which is where most of the initial misses were.
 */
async function manifestIcons(html: string, pageUrl: string): Promise<Candidate[]> {
  const tag = /<link\b[^>]*rel\s*=\s*["'][^"']*manifest[^"']*["'][^>]*>/i.exec(html)?.[0];
  const href = tag ? /href\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1] : undefined;
  if (!href) return [];
  try {
    const manifestUrl = new URL(href, pageUrl).toString();
    const manifest = JSON.parse(await (await get(manifestUrl, "application/json")).text());
    if (!Array.isArray(manifest.icons)) return [];
    return manifest.icons.flatMap((entry: { src?: string; sizes?: string }) => {
      if (!entry.src) return [];
      const declared = Math.max(0, ...[...String(entry.sizes ?? "").matchAll(/(\d+)x(\d+)/gi)].map((m) => Number(m[1])));
      try {
        return [{ url: new URL(entry.src, manifestUrl).toString(), rel: "manifest", sizes: declared || 64 }];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}

/**
 * The conventional paths, tried only when nothing declared is big enough.
 *
 * Guessing these first was a dead end - they 404 at the root on most of these
 * sites - but as a last resort they recover the ones that ship a 180px
 * apple-touch-icon without ever declaring it.
 */
function conventionalIcons(pageUrl: string): Candidate[] {
  return ["/apple-touch-icon.png", "/apple-touch-icon-precomposed.png", "/favicon-192x192.png"]
    .map((suffix) => ({ url: new URL(suffix, pageUrl).toString(), rel: "conventional", sizes: 1 }));
}

/** Intrinsic size straight from the file header, so a wrong number cannot ship. */
function imageSize(bytes: Buffer): { width: number; height: number; ext: string } | null {
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), ext: "png" };
  }
  const head = bytes.subarray(0, 400).toString("utf8");
  if (head.includes("<svg") || head.includes("<?xml")) return { width: 0, height: 0, ext: "svg" };
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return { width: 0, height: 0, ext: "jpg" };
  // .ico: a directory of images; byte 6 holds the first entry's width (0 = 256).
  if (bytes.readUInt16LE(0) === 0 && bytes.readUInt16LE(2) === 1) {
    const w = bytes[6] === 0 ? 256 : bytes[6];
    return { width: w, height: bytes[7] === 0 ? 256 : bytes[7], ext: "ico" };
  }
  if (bytes.subarray(0, 4).toString("ascii") === "RIFF") return { width: 0, height: 0, ext: "webp" };
  return null;
}

async function get(url: string, accept: string) {
  const response = await fetch(url, {
    redirect: "follow",
    headers: { "user-agent": UA, accept },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response;
}

const results: { school: string; status: string; detail: string }[] = [];
const entries: string[] = [];

await mkdir(OUT_DIR, { recursive: true });

const schools = listCoveredSchoolNames()
  .map((name) => lookupSchoolSource(name))
  .filter((record): record is NonNullable<typeof record> => record !== null)
  .filter((record) => filter.length === 0 || filter.some((f) => record.schoolName.toLowerCase().includes(f)))
  .filter((record) => {
    if (!DECLINED_SCHOOLS.includes(record.schoolName)) return true;
    results.push({ school: record.schoolName, status: "declined", detail: "on the declined list" });
    return false;
  });

console.log(`${schools.length} schools; writing to public/school-logos/\n`);

for (const record of schools) {
  const { schoolName } = record;
  let domain = "";
  try {
    if (!record.sourceUrl) throw new Error("no cited source URL to derive a domain from");
    domain = registrableDomain(new URL(record.sourceUrl).hostname);
    const page = `https://${domain}/`;
    const html = await (await get(page, "text/html")).text();

    const candidates = [
      ...declaredIcons(html, page),
      ...(await manifestIcons(html, page)),
      ...conventionalIcons(page),
    ].sort((a, b) => b.sizes - a.sizes);
    if (candidates.length === 0) throw new Error("no icon declared anywhere");

    // Try in order of promised size and keep the first that is genuinely big
    // enough: a declared size is a claim, not a measurement.
    let icon: Candidate | null = null;
    let bytes: Buffer | null = null;
    let size: ReturnType<typeof imageSize> = null;
    // Reasons are not equally informative: a 404 on a guessed conventional path
    // is expected noise, whereas "the biggest one is 32px" is the real finding.
    // Keeping the last error reported every miss as a 404 and hid the truth.
    let why = "no usable icon found";
    let floorMiss = "";
    for (const candidate of candidates) {
      try {
        const data = Buffer.from(await (await get(candidate.url, "image/*")).arrayBuffer());
        if (data.byteLength === 0) continue;
        const measured = imageSize(data);
        if (!measured) continue;
        // Below 64px a logo looks worse than the generated mark it replaces.
        if (measured.ext !== "svg" && measured.width > 0 && measured.width < 64) {
          floorMiss = `largest available is ${measured.width}px, below the 64px floor`;
          continue;
        }
        icon = candidate;
        bytes = data;
        size = measured;
        break;
      } catch (candidateError) {
        why = candidateError instanceof Error ? candidateError.message : String(candidateError);
      }
    }
    if (!icon || !bytes || !size) throw new Error(floorMiss || why);

    // A rerun that resolves a different format would otherwise leave the old
    // file behind, and a stale logo is worse than none.
    const slug = slugify(schoolName);
    for (const ext of ["png", "svg", "ico", "jpg", "webp"]) {
      if (ext !== size.ext) await rm(path.join(OUT_DIR, `${slug}.${ext}`), { force: true });
    }

    const file = `/school-logos/${slug}.${size.ext}`;
    await writeFile(path.join(process.cwd(), "public", file.replace(/^\//, "")), bytes);

    entries.push([
      "  {",
      `    school: ${JSON.stringify(schoolName)},`,
      `    file: ${JSON.stringify(file)},`,
      `    width: ${size.width},`,
      `    height: ${size.height},`,
      `    domain: ${JSON.stringify(domain)},`,
      `    declaredOn: ${JSON.stringify(page)},`,
      `    sourceUrl: ${JSON.stringify(icon.url)},`,
      `    rel: ${JSON.stringify(icon.rel)},`,
      `    sha256: ${JSON.stringify(createHash("sha256").update(bytes).digest("hex"))},`,
      `    retrievedAt: ${JSON.stringify(TODAY)},`,
      "  },",
    ].join("\n"));

    const shown = size.ext === "svg" ? "svg" : `${size.width}x${size.height}`;
    results.push({ school: schoolName, status: "ok", detail: `${shown} ${size.ext} from ${domain}` });
    console.log(`  ok        ${schoolName} — ${shown} ${size.ext}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    results.push({ school: schoolName, status: "skipped", detail });
    console.log(`  skipped   ${schoolName} — ${detail}`);
  }
}

// Rewrite only the array literal, leaving the file's documentation intact.
const source = await readFile(REGISTRY, "utf8");
const marker = "export const SCHOOL_LOGOS: readonly SchoolLogo[] = ";
const start = source.indexOf(marker);
if (start === -1) throw new Error("could not find SCHOOL_LOGOS in school-logos.ts");
const end = source.indexOf("\n\n", start);
const replacement = entries.length > 0
  ? `${marker}[\n${entries.join("\n")}\n];`
  : `${marker}[];`;
await writeFile(REGISTRY, source.slice(0, start) + replacement + source.slice(end));

const ok = results.filter((r) => r.status === "ok").length;
console.log(`\n${ok} of ${schools.length} resolved; ${schools.length - ok} fall back to the generated mark.`);
console.log("Image files are gitignored. src/lib/school-logos.ts is now modified —");
console.log("read its header on trademark before committing it or setting SHOW_SCHOOL_LOGOS=1.");
