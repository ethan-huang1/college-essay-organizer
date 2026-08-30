/**
 * Renders every resolved logo as it will actually appear — a 44px disc, with
 * the same white plate or full-bleed treatment the app applies — onto a few
 * sheets that can be eyeballed in one go.
 *
 * Automated tests cannot see that a mark is cropped, upside down, or the wrong
 * institution. This is for looking.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import sharp, { type OverlayOptions } from "sharp";

import { SCHOOL_LOGOS } from "../src/lib/school-logos.ts";
import { listCoveredSchoolNames } from "../src/lib/retrieval/registry.ts";
import { markColour, schoolInitials } from "../src/app/mark-palette.ts";

const OUT = path.join(process.cwd(), ".screenshots");
const COLS = 6;
const CELL = 230;
const DISC = 88;          // 44px at 2x, the real rendered size
const ROW_H = 132;

const escape = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const byName = new Map(SCHOOL_LOGOS.map((logo) => [logo.school, logo]));
const schools = listCoveredSchoolNames().sort((a, b) => a.localeCompare(b));

const PER_SHEET = 30;
await mkdir(OUT, { recursive: true });

for (let sheet = 0; sheet * PER_SHEET < schools.length; sheet += 1) {
  const slice = schools.slice(sheet * PER_SHEET, (sheet + 1) * PER_SHEET);
  const rows = Math.ceil(slice.length / COLS);
  const width = COLS * CELL;
  const height = rows * ROW_H + 46;

  const labels: string[] = [];
  const composites: OverlayOptions[] = [];

  for (const [index, school] of slice.entries()) {
    const col = index % COLS;
    const row = Math.floor(index / COLS);
    const cx = col * CELL + CELL / 2;
    const cy = row * ROW_H + 46 + DISC / 2;
    const logo = byName.get(school);

    // The disc, matching .mark / .mark-logo in primitives.css.
    if (logo) {
      // Mirror .mark-logo / .mark-bleed and the registry's render.background,
      // or the sheet lies: a white mark on its dark plate looked blank here
      // while the app was drawing it correctly.
      const plate = logo.fullBleed
        ? ""
        : `<circle cx="${DISC / 2}" cy="${DISC / 2}" r="${DISC / 2 - 0.5}" fill="${logo.render?.background ?? "#fff"}"`
          + `${logo.render?.background ? "" : ' stroke="#e4dfd2"'}/>`;
      const disc = await sharp(Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${DISC}" height="${DISC}">${plate}</svg>`,
      )).png().toBuffer();
      const art = await sharp(path.join(process.cwd(), "public", logo.file.replace(/^\//, "")))
        .resize(DISC, DISC, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png().toBuffer();
      const masked = await sharp(disc)
        .composite([{ input: art }, {
          // Clip to the circle exactly as border-radius: 50% does.
          input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${DISC}" height="${DISC}"><circle cx="${DISC / 2}" cy="${DISC / 2}" r="${DISC / 2}" fill="#fff"/></svg>`),
          blend: "dest-in",
        }])
        .png().toBuffer();
      composites.push({ input: masked, left: Math.round(cx - DISC / 2), top: Math.round(cy - DISC / 2) });
    } else {
      const initials = schoolInitials(school);
      const disc = Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${DISC}" height="${DISC}">`
        + `<circle cx="${DISC / 2}" cy="${DISC / 2}" r="${DISC / 2}" fill="${markColour(school)}"/>`
        + `<text x="50%" y="50%" dy="0.35em" text-anchor="middle" fill="#fff"`
        + ` font-family="Helvetica,Arial" font-size="28" font-weight="700">${escape(initials)}</text></svg>`,
      );
      composites.push({
        input: await sharp(disc).png().toBuffer(),
        left: Math.round(cx - DISC / 2), top: Math.round(cy - DISC / 2),
      });
    }

    const tag = logo
      ? `${logo.origin === "secondary" ? "· wiki · " : ""}${logo.fullBleed ? "bleed" : "inset"} ${logo.aspect.toFixed(2)}`
      : "INITIALS";
    const words = school.split(" ");
    const line1 = escape(words.slice(0, 3).join(" "));
    const line2 = escape(words.slice(3).join(" "));
    labels.push(
      `<text x="${cx}" y="${cy + DISC / 2 + 16}" text-anchor="middle" font-family="Helvetica,Arial" font-size="12" fill="#191814">${line1}</text>`
      + `<text x="${cx}" y="${cy + DISC / 2 + 30}" text-anchor="middle" font-family="Helvetica,Arial" font-size="12" fill="#191814">${line2}</text>`
      + `<text x="${cx}" y="${cy + DISC / 2 + 44}" text-anchor="middle" font-family="Helvetica,Arial" font-size="10" fill="${logo ? "#5f5c56" : "#7a322d"}">${escape(tag)}</text>`,
    );
  }

  const base = await sharp({
    create: { width, height, channels: 4, background: { r: 247, g: 244, b: 237, alpha: 1 } },
  }).png().toBuffer();

  const withLabels = await sharp(base).composite([{
    input: Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`
      + `<text x="16" y="28" font-family="Helvetica,Arial" font-size="17" font-weight="700" fill="#191814">`
      + `Logo contact sheet ${sheet + 1} — ${slice.length} schools</text>${labels.join("")}</svg>`,
    ),
  }]).png().toBuffer();

  const file = path.join(OUT, `logo-sheet-${sheet + 1}.png`);
  await writeFile(file, await sharp(withLabels).composite(composites).png().toBuffer());
  console.log(path.relative(process.cwd(), file));
}
