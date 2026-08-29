import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { listCoveredSchoolNames } from "./retrieval/registry";
import { DECLINED_SCHOOLS, SCHOOL_LOGOS, logoForSchool, logosEnabled } from "./school-logos";

/**
 * A logo is a trademark, so the thing most worth testing is not the metadata —
 * it is that the feature stays off unless someone deliberately turns it on.
 *
 * These tests establish nothing about whether the use is permitted. They check
 * the gates hold and the registry is internally consistent.
 */

const original = process.env.SHOW_SCHOOL_LOGOS;

afterEach(() => {
  if (original === undefined) delete process.env.SHOW_SCHOOL_LOGOS;
  else process.env.SHOW_SCHOOL_LOGOS = original;
});

describe("logos are off unless deliberately enabled", () => {
  it("is disabled when SHOW_SCHOOL_LOGOS is unset", () => {
    delete process.env.SHOW_SCHOOL_LOGOS;
    expect(logosEnabled()).toBe(false);
  });

  it.each(["", "0", "false", "true", "yes", "1 "])(
    "stays disabled for SHOW_SCHOOL_LOGOS=%o",
    (value) => {
      // Only the exact string "1" enables it, so a truthy-looking value in a
      // deployment config cannot switch trademarks on by accident.
      process.env.SHOW_SCHOOL_LOGOS = value;
      expect(logosEnabled()).toBe(false);
    },
  );

  it("is enabled only by exactly \"1\"", () => {
    process.env.SHOW_SCHOOL_LOGOS = "1";
    expect(logosEnabled()).toBe(true);
  });

  it("serves no logo at all while disabled, whatever the registry holds", () => {
    delete process.env.SHOW_SCHOOL_LOGOS;
    for (const logo of SCHOOL_LOGOS) {
      expect(logoForSchool(logo.school)).toBeUndefined();
    }
    expect(logoForSchool("Brown University")).toBeUndefined();
  });

  it("refuses a declined school even when enabled and registered", () => {
    // A removal request must not depend on remembering to re-run a script, so
    // the decline is enforced at read time as well as at fetch time.
    process.env.SHOW_SCHOOL_LOGOS = "1";
    for (const declined of DECLINED_SCHOOLS) {
      expect(logoForSchool(declined)).toBeUndefined();
    }
  });
});

describe("logo registry consistency", () => {
  it("has no duplicate schools or files", () => {
    expect(new Set(SCHOOL_LOGOS.map((l) => l.school)).size).toBe(SCHOOL_LOGOS.length);
    expect(new Set(SCHOOL_LOGOS.map((l) => l.file)).size).toBe(SCHOOL_LOGOS.length);
  });

  it("lists no school that is also declined", () => {
    for (const logo of SCHOOL_LOGOS) {
      expect(DECLINED_SCHOOLS).not.toContain(logo.school);
    }
  });

  it.each(SCHOOL_LOGOS.map((l) => [l.school, l] as const))(
    "%s records where the asset came from",
    (_school, logo) => {
      const known = new Set(listCoveredSchoolNames());
      expect(known.has(logo.school), `${logo.school} is not a researched school`).toBe(true);
      expect(logo.file).toMatch(/^\/school-logos\/[a-z0-9-]+\.(png|svg|ico|jpg|webp)$/);
      expect(logo.sourceUrl).toMatch(/^https:\/\//);
      expect(logo.declaredOn).toMatch(/^https:\/\//);
      expect(logo.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(logo.retrievedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      // The identity guarantee comes from where the icon was *declared*, not
      // where the bytes are hosted: Richmond declares its icon on richmond.edu
      // but serves it from CloudFront, which is normal and fine. What must hold
      // is that the university's own page pointed at it.
      expect(new URL(logo.declaredOn).hostname).toContain(logo.domain.split(".")[0]);
    },
  );

  it.each(SCHOOL_LOGOS.map((l) => [l.school, l] as const))(
    "%s has its file present at the recorded size and hash",
    (_school, logo) => {
      // public/school-logos/ is gitignored, so a populated registry with no
      // files means someone committed the registry alone - which would render
      // as broken images. That is exactly what this catches.
      const path = join(process.cwd(), "public", logo.file.replace(/^\//, ""));
      expect(
        existsSync(path),
        `${logo.file} is missing. Either run "npm run logos:fetch" or reset SCHOOL_LOGOS to [] before committing.`,
      ).toBe(true);

      const bytes = readFileSync(path);
      // Dimensions live in a different place in every format, so the check has
      // to dispatch on the actual signature. Reading PNG offsets out of an .ico
      // is what made this test claim Penn's 229x256 icon was corrupt.
      const isPng = bytes.subarray(0, 8).equals(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      );
      const isIco = bytes.readUInt16LE(0) === 0 && bytes.readUInt16LE(2) === 1;

      if (isPng) {
        expect(bytes.readUInt32BE(16)).toBe(logo.width);
        expect(bytes.readUInt32BE(20)).toBe(logo.height);
      } else if (isIco) {
        // A zero byte means 256 in an .ico directory entry.
        expect(bytes[6] === 0 ? 256 : bytes[6]).toBe(logo.width);
        expect(bytes[7] === 0 ? 256 : bytes[7]).toBe(logo.height);
      }

      // Below 64px a logo looks worse than the mark it replaces. Formats whose
      // size is not recorded (SVG scales; JPEG is not parsed) store 0.
      if (logo.width > 0) expect(logo.width).toBeGreaterThanOrEqual(64);
    },
  );
});
