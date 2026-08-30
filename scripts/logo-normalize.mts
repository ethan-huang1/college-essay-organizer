/**
 * Turns whatever a university publishes into one predictable asset.
 *
 * Sources are wildly inconsistent: 180×180 opaque app icons, transparent
 * wordmark SVGs, 229×256 favicons, seals with 20% built-in whitespace. Handing
 * those to the same CSS box is what made Penn look zoomed and cropped — a
 * 229×256 image under `object-fit: cover` loses its sides.
 *
 * So normalisation happens once, here, at fetch time, and every output is a
 * 512×512 PNG whose content occupies a known fraction of the frame. Rendering
 * then has nothing left to decide.
 *
 * Two asset classes get different treatment, because treating them alike is
 * what looks wrong:
 *
 * - **Full-bleed app icons** — opaque, with a coloured field running to the
 *   edge. These are *designed* to fill a rounded square, so they keep their
 *   field and are only padded (never cropped) to square. Yale's blue Y is one.
 * - **Free-standing marks** — transparent, or sitting on white. These are
 *   trimmed to their real content and re-inset with a consistent margin, so a
 *   seal with generous built-in whitespace and one with none end up the same
 *   perceived size.
 */
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import sharp, { type Metadata, type OutputInfo, type Sharp } from "sharp";

/** Output frame. Generous, so a 44px mark on a 2× display is still oversampled. */
export const FRAME = 512;

/**
 * Fraction of the frame a free-standing mark's *long* edge fills.
 *
 * Tuned by eye against the full-bleed icons: an inset dark mark reads smaller
 * than a saturated circle of the same diameter, so it is given slightly more
 * room than a naive "leave 10% margin" would.
 */
const INSET_FILL = 0.84;

/**
 * Fraction of the frame taken by a free-standing mark's *diagonal*.
 *
 * Sizing by the long edge made wide marks look tiny: a 1.7:1 lockup set to 84%
 * width is only 49% tall, so it reads as small in a circle even though it is
 * technically "the same size" as a square mark. Sizing by the diagonal instead
 * gives a wide mark more room and a square mark slightly less, which is what
 * makes a grid of a hundred different shapes look evenly weighted.
 *
 * Above 1.0 the corners of a perfectly square mark would poke outside the
 * circle, which is why this sits just under it - and why marks are almost never
 * square-cornered anyway.
 */
const INSET_DIAGONAL = 0.99;

/** Below this, upscaling shows. 64px of real content is the floor. */
export const MIN_CONTENT = 64;

/**
 * A hard ceiling for normalisation. Wide lockups are allowed through this far
 * so that selection can compare them against squarer options and reject them on
 * quality rather than never seeing them.
 */
const MAX_ASPECT = 4.2;

/**
 * Above this a mark is too wide to read in a 44px circle whatever we do, so a
 * school with nothing squarer keeps its initials. A 2.5:1 wordmark is about
 * 17px tall in the disc, which a bold lockup survives. Selection prefers
 * squarer assets long before this becomes relevant.
 */
export const USABLE_ASPECT = 2.5;

export type Normalized = {
  png: Buffer;
  /** Aspect ratio of the real content, after trimming. */
  aspect: number;
  /** Long edge of the real content in source pixels, before scaling. */
  contentPx: number;
  fullBleed: boolean;
  sourceFormat: string;
  sourceSize: string;
  /**
   * The mark is white or near-white - drawn for a dark header. On a white disc
   * it is invisible, so it needs a dark plate rather than rejection. George
   * Washington, Middlebury and Reed all publish marks like this.
   */
  light: boolean;
  /**
   * Fraction of the frame the mark actually inks, 0-1. A fine-line seal covers
   * very little and reads as a faint smudge at 44px, so selection can prefer a
   * denser mark where one exists.
   */
  ink: number;
};

/** Distinct-colour count above which an image is a photograph or a collage. */
const MAX_COLOURS = 55;

export type NormalizeFailure = { ok: false; why: string };
export type NormalizeResult = ({ ok: true } & Normalized) | NormalizeFailure;

/**
 * Pulls the largest image out of an .ico, which sharp cannot read.
 *
 * A modern .ico usually embeds a PNG per size, in which case the bytes can be
 * handed straight to sharp. A legacy BMP-encoded one goes through `sips`,
 * which macOS ships.
 */
async function fromIco(bytes: Buffer): Promise<{ bytes: Buffer; note: string } | null> {
  if (bytes.length < 6 || bytes.readUInt16LE(0) !== 0 || bytes.readUInt16LE(2) !== 1) return null;
  const count = bytes.readUInt16LE(4);
  let best: { offset: number; size: number; area: number } | null = null;

  for (let index = 0; index < count; index += 1) {
    const entry = 6 + index * 16;
    if (entry + 16 > bytes.length) break;
    const width = bytes[entry] === 0 ? 256 : bytes[entry];
    const height = bytes[entry + 1] === 0 ? 256 : bytes[entry + 1];
    const size = bytes.readUInt32LE(entry + 8);
    const offset = bytes.readUInt32LE(entry + 12);
    const area = width * height;
    if (offset + size <= bytes.length && (!best || area > best.area)) best = { offset, size, area };
  }
  if (!best) return null;

  const payload = bytes.subarray(best.offset, best.offset + best.size);
  const isPng = payload.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (isPng) return { bytes: payload, note: "png embedded in ico" };

  // A BMP-encoded icon. sips reads the container directly.
  const dir = await mkdtemp(path.join(tmpdir(), "logo-ico-"));
  try {
    const input = path.join(dir, "in.ico");
    const output = path.join(dir, "out.png");
    await writeFile(input, bytes);
    const result = spawnSync("sips", ["-s", "format", "png", input, "--out", output], { stdio: "ignore" });
    if (result.status !== 0) return null;
    return { bytes: await readFile(output), note: "bmp ico via sips" };
  } catch {
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Is the image opaque with a coloured field reaching its border? */
async function isFullBleed(image: Sharp, width: number, height: number): Promise<boolean> {
  const { data, info } = await image.clone().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const channels = info.channels;
  const at = (x: number, y: number) => {
    const offset = (y * width + x) * channels;
    return { r: data[offset], g: data[offset + 1], b: data[offset + 2], a: data[offset + 3] };
  };

  // Sample the border rather than every pixel: a ring of opaque, similar,
  // non-white pixels means a designed field rather than a mark on a page.
  const samples: { r: number; g: number; b: number; a: number }[] = [];
  const steps = 24;
  for (let index = 0; index < steps; index += 1) {
    const t = index / (steps - 1);
    const x = Math.min(width - 1, Math.round(t * (width - 1)));
    const y = Math.min(height - 1, Math.round(t * (height - 1)));
    samples.push(at(x, 0), at(x, height - 1), at(0, y), at(width - 1, y));
  }

  const opaque = samples.filter((pixel) => pixel.a > 250);
  if (opaque.length < samples.length * 0.95) return false;

  // Near-white borders are page background, not a field: those want trimming.
  const meanLuma = opaque.reduce((sum, p) => sum + (0.2126 * p.r + 0.7152 * p.g + 0.0722 * p.b), 0) / opaque.length;
  if (meanLuma > 235) return false;

  // A field is roughly one colour; a photo or a busy edge is not.
  const mean = ["r", "g", "b"].map((key) =>
    opaque.reduce((sum, p) => sum + (p as unknown as Record<string, number>)[key], 0) / opaque.length);
  const spread = opaque.reduce((worst, p) => {
    const delta = Math.max(
      Math.abs(p.r - mean[0]), Math.abs(p.g - mean[1]), Math.abs(p.b - mean[2]),
    );
    return Math.max(worst, delta);
  }, 0);
  return spread < 46;
}

/**
 * Cheap content statistics, measured on a 64x64 downsample.
 *
 * Calibrated against known-good marks and known-bad grabs: real marks used
 * 8-31 distinct colours, while a photograph of a campus used 78-130 and a grid
 * of third-party brand icons used 91. That gap is what lets a photograph be
 * rejected before it ever reaches a school card.
 */
async function analyse(bytes: Buffer, isSvg: boolean) {
  const { data, info } = await sharp(bytes, isSvg ? { density: 200 } : {})
    .resize(64, 64, { fit: "inside" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const colours = new Set<number>();
  let sum = 0;
  let sumSquares = 0;
  let opaque = 0;
  let total = 0;

  for (let index = 0; index < data.length; index += info.channels) {
    const [r, g, b, a] = [data[index], data[index + 1], data[index + 2], data[index + 3]];
    total += 1;
    if (a < 128) continue;
    opaque += 1;
    // 3 bits per channel: tolerant of antialiasing, still separates a
    // photograph's thousands of shades from a mark's handful.
    colours.add(((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5));
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    sum += luma;
    sumSquares += luma * luma;
  }

  const mean = opaque > 0 ? sum / opaque : 255;
  const variance = opaque > 0 ? sumSquares / opaque - mean * mean : 0;
  return {
    colours: colours.size,
    meanLuma: mean,
    stdLuma: Math.sqrt(Math.max(0, variance)),
    ink: total > 0 ? opaque / total : 0,
  };
}

export async function normalizeLogo(
  raw: Buffer,
  declaredExt: string,
  /** The source states this file is a seal/logo/crest, which raises the colour ceiling. */
  namedMark = false,
): Promise<NormalizeResult> {
  let bytes = raw;
  let note = "";

  if (declaredExt === "ico" || (raw.length > 4 && raw.readUInt16LE(0) === 0 && raw.readUInt16LE(2) === 1)) {
    const extracted = await fromIco(raw);
    if (!extracted) return { ok: false, why: "could not read the .ico" };
    bytes = extracted.bytes;
    note = extracted.note;
  }

  // SVG is rasterised large so the trim and the downscale both have detail to
  // work with; density is what controls the raster size, not width/height.
  const isSvg = bytes.subarray(0, 512).toString("utf8").includes("<svg");
  let image: Sharp;
  try {
    image = isSvg ? sharp(bytes, { density: 900 }) : sharp(bytes);
  } catch (error) {
    return { ok: false, why: error instanceof Error ? error.message : "unreadable" };
  }

  let meta: Metadata;
  try {
    meta = await image.metadata();
  } catch (error) {
    return { ok: false, why: error instanceof Error ? error.message.split("\n")[0] : "no metadata" };
  }
  if (!meta.width || !meta.height) return { ok: false, why: "no dimensions" };

  const sourceSize = `${meta.width}x${meta.height}`;
  const sourceFormat = note || meta.format || declaredExt;

  // An animated GIF or a photo is not a logo.
  if ((meta.pages ?? 1) > 1) return { ok: false, why: "animated" };

  const stats = await analyse(bytes, isSvg);
  // A logo has a handful of flat colours, which is what rejects New York
  // University's homepage photograph and Bowdoin's grid of partner icons.
  //
  // Named marks get a much higher ceiling: an engraved coat of arms is
  // legitimately colourful - Villanova's seal measures 97 - and is statistically
  // indistinguishable from a photograph. The name is the evidence that
  // separates them, so a caller that knows the file is a seal says so.
  const ceiling = namedMark ? 140 : MAX_COLOURS;
  if (stats.colours > ceiling) {
    return { ok: false, why: `${stats.colours} distinct colours - a photograph or collage, not a mark` };
  }

  const fullBleed = !isSvg && await isFullBleed(image, meta.width, meta.height);

  if (fullBleed) {
    // Keep the designed field; pad the short edge so nothing is ever cropped.
    // This is the Penn fix: 229×256 becomes 256×256 by adding field colour,
    // not by shaving 27px off the sides.
    const long = Math.max(meta.width, meta.height);
    if (long < MIN_CONTENT) return { ok: false, why: `only ${sourceSize}, below the ${MIN_CONTENT}px floor` };

    const { data } = await image.clone().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const corner = { r: data[0], g: data[1], b: data[2], alpha: 1 };

    const png = await sharp(bytes)
      .resize(FRAME, FRAME, { fit: "contain", background: corner, position: "centre" })
      .png({ compressionLevel: 9 })
      .toBuffer();

    return {
      ok: true, png, aspect: meta.width / meta.height, contentPx: long,
      fullBleed: true, sourceFormat, sourceSize,
      light: false, ink: stats.ink,
    };
  }

  // Free-standing mark: find the real content, then re-inset it consistently.
  let trimmed: Buffer;
  let trimInfo: OutputInfo;
  try {
    const result = await image
      .clone()
      .ensureAlpha()
      // 12/255 tolerates JPEG ringing and off-white page backgrounds without
      // eating antialiased edges.
      .trim({ threshold: 12 })
      .raw()
      .toBuffer({ resolveWithObject: true });
    trimmed = result.data;
    trimInfo = result.info;
  } catch (error) {
    return { ok: false, why: `trim failed: ${error instanceof Error ? error.message.split("\n")[0] : "?"}` };
  }

  const contentW = trimInfo.width;
  const contentH = trimInfo.height;
  if (contentW < 2 || contentH < 2) return { ok: false, why: "trimmed to nothing (blank image)" };

  const aspect = contentW / contentH;
  if (aspect > MAX_ASPECT || aspect < 1 / MAX_ASPECT) {
    return { ok: false, why: `content is ${aspect.toFixed(1)}:1, too elongated for a badge` };
  }

  const contentPx = Math.max(contentW, contentH);
  // SVG is scalable, so its rasterised size is not evidence of quality.
  if (!isSvg && contentPx < MIN_CONTENT) {
    return { ok: false, why: `only ${contentW}x${contentH} of real content, below the ${MIN_CONTENT}px floor` };
  }

  // Scale so the content's diagonal is a fixed fraction of the frame, then cap
  // the long edge so a very elongated mark cannot run past the disc's width.
  const diagonal = Math.hypot(contentW, contentH);
  const scale = Math.min(
    (FRAME * INSET_DIAGONAL) / diagonal,
    (FRAME * INSET_FILL) / Math.max(contentW, contentH),
  );
  const scaled = await sharp(trimmed, { raw: { width: contentW, height: contentH, channels: 4 } })
    .resize({
      width: Math.max(1, Math.round(contentW * scale)),
      height: Math.max(1, Math.round(contentH * scale)),
      fit: "fill",
    })
    .png()
    .toBuffer();

  const png = await sharp({
    create: { width: FRAME, height: FRAME, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: scaled, gravity: "centre" }])
    .png({ compressionLevel: 9 })
    .toBuffer();

  return {
    ok: true, png, aspect, contentPx, fullBleed: false, sourceFormat, sourceSize,
    // Near-white and low-variance means a mark drawn for a dark header.
    light: stats.meanLuma > 225 && stats.stdLuma < 40,
    ink: stats.ink,
  };
}
