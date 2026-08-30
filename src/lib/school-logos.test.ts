import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { listCoveredSchoolNames } from "./retrieval/registry";
import { DECLINED_SCHOOLS, NO_USABLE_LOGO, SCHOOL_LOGOS, logoForSchool, logosEnabled } from "./school-logos";

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

describe("when logos are shown", () => {
  /*
   * The contract changed when the assets were committed for deployment. It used
   * to be "off unless SHOW_SCHOOL_LOGOS=1", which was right while the files were
   * gitignored and the registry was empty: three gates so trademarked marks
   * could not ship by accident. With the files deliberately committed, that gate
   * would only have produced a deploy that silently rendered initials.
   *
   * What still has to hold: an empty registry shows initials, the kill switch
   * works, and an excluded school is never served.
   */

  it("shows logos because the registry is populated", () => {
    delete process.env.SHOW_SCHOOL_LOGOS;
    expect(SCHOOL_LOGOS.length).toBeGreaterThan(0);
    expect(logosEnabled()).toBe(true);
  });

  it("can be switched off entirely with SHOW_SCHOOL_LOGOS=0", () => {
    // The switch to reach for if a takedown request arrives: it needs no code
    // change and no redeploy of assets.
    process.env.SHOW_SCHOOL_LOGOS = "0";
    expect(logosEnabled()).toBe(false);
    expect(logoForSchool("Brown University")).toBeUndefined();
  });

  it("ignores any other value rather than guessing", () => {
    for (const value of ["", "1", "true", "yes", "off", "false"]) {
      process.env.SHOW_SCHOOL_LOGOS = value;
      expect(logosEnabled(), `SHOW_SCHOOL_LOGOS=${JSON.stringify(value)}`).toBe(true);
    }
  });

  it("serves a logo for a school that has one", () => {
    delete process.env.SHOW_SCHOOL_LOGOS;
    const first = SCHOOL_LOGOS[0];
    expect(logoForSchool(first.school)?.file).toBe(first.file);
  });

  it("refuses a declined school even though logos are on", () => {
    delete process.env.SHOW_SCHOOL_LOGOS;
    for (const declined of DECLINED_SCHOOLS) {
      expect(logoForSchool(declined)).toBeUndefined();
    }
  });

  it("refuses a hand-excluded school even though logos are on", () => {
    delete process.env.SHOW_SCHOOL_LOGOS;
    for (const school of NO_USABLE_LOGO) {
      expect(logoForSchool(school)).toBeUndefined();
    }
  });

  it("returns nothing for a school with no entry", () => {
    delete process.env.SHOW_SCHOOL_LOGOS;
    expect(logoForSchool("A College With No Logo At All")).toBeUndefined();
  });

  it("resolves a shorter name only when it is unambiguous", () => {
    delete process.env.SHOW_SCHOOL_LOGOS;
    // Maryland is stored under both names in a real workspace; California is
    // seven campuses and must resolve to none of them.
    expect(logoForSchool("University of Maryland")?.school).toBe("University of Maryland, College Park");
    expect(logoForSchool("University of California")).toBeUndefined();
  });
});

describe("logo registry consistency", () => {
  it("has no duplicate schools or files", () => {
    expect(new Set(SCHOOL_LOGOS.map((l) => l.school)).size).toBe(SCHOOL_LOGOS.length);
    expect(new Set(SCHOOL_LOGOS.map((l) => l.file)).size).toBe(SCHOOL_LOGOS.length);
  });

  it("lists no school that is also declined or hand-excluded", () => {
    for (const logo of SCHOOL_LOGOS) {
      expect(DECLINED_SCHOOLS).not.toContain(logo.school);
      expect(NO_USABLE_LOGO, `${logo.school} is hand-excluded but still registered`).not.toContain(logo.school);
    }
  });

  it("refuses a hand-excluded school even when enabled", () => {
    process.env.SHOW_SCHOOL_LOGOS = "1";
    for (const school of NO_USABLE_LOGO) {
      expect(logoForSchool(school)).toBeUndefined();
    }
  });

  it.each(SCHOOL_LOGOS.map((l) => [l.school, l] as const))(
    "%s records where the asset came from",
    (_school, logo) => {
      const known = new Set(listCoveredSchoolNames());
      expect(known.has(logo.school), `${logo.school} is not a researched school`).toBe(true);
      // Every asset is normalised to one format, so anything else is a bug in
      // the fetcher rather than a quirk of the source.
      expect(logo.file).toMatch(/^\/school-logos\/[a-z0-9-]+\.png$/);
      expect(logo.sourceUrl).toMatch(/^https:\/\//);
      expect(logo.declaredOn).toMatch(/^https:\/\//);
      expect(logo.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(logo.retrievedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(logo.via.length).toBeGreaterThan(0);
      expect(logo.sourceSize).toMatch(/^\d+x\d+$/);
      expect(["official", "secondary"]).toContain(logo.origin);
    },
  );

  it.each(SCHOOL_LOGOS.filter((l) => l.origin === "official").map((l) => [l.school, l] as const))(
    "%s (official) was declared on the university's own domain",
    (_school, logo) => {
      // The identity guarantee for an official asset: the university's own page
      // pointed at it. The bytes may sit on a CDN - Richmond declares its icon
      // on richmond.edu and serves it from CloudFront - so this checks the page,
      // not the host.
      expect(new URL(logo.declaredOn).hostname).toContain(logo.domain.split(".")[0]);
    },
  );

  it.each(SCHOOL_LOGOS.filter((l) => l.origin === "secondary").map((l) => [l.school, l] as const))(
    "%s (secondary) says where it really came from",
    (_school, logo) => {
      // A third-party asset must be traceable to the claim that identifies it,
      // because nobody at the university published it as their mark.
      expect(logo.declaredOn).toMatch(/wikimedia\.org|wikipedia\.org/);
      // One of three provenance forms must be recorded, or there is no way to
      // re-check the identity later: a Wikidata claim, the Wikipedia article
      // whose infobox supplied it, or a note saying a human chose it.
      expect(
        logo.note ?? "",
        `${logo.school} has no note recording where this mark came from`,
      ).toMatch(/Wikidata Q\d+|Wikipedia infobox|curated/);
    },
  );

  it("keeps every mark inside the aspect ratio a 44px badge can show", () => {
    for (const logo of SCHOOL_LOGOS) {
      // Wider than 3:1 and a mark is a few illegible pixels tall in the circle;
      // initials beat that.
      expect(logo.aspect, `${logo.school} is ${logo.aspect}:1`).toBeLessThanOrEqual(3);
      expect(logo.aspect, `${logo.school} is ${logo.aspect}:1`).toBeGreaterThanOrEqual(1 / 3);
    }
  });

  it("uses no upscaled bitmap", () => {
    for (const logo of SCHOOL_LOGOS) {
      // SVG sources record their rasterised size and are exempt: they scale.
      if (/svg/i.test(logo.sourceFormat)) continue;
      expect(logo.contentPx, `${logo.school} had only ${logo.contentPx}px of content`).toBeGreaterThanOrEqual(64);
    }
  });

  it.each(SCHOOL_LOGOS.map((l) => [l.school, l] as const))(
    "%s has its normalised file present and unmodified",
    (_school, logo) => {
      // public/school-logos/ is gitignored, so a populated registry with no
      // files means the registry was committed alone - which would render as
      // broken images. That is exactly what this catches.
      const path = join(process.cwd(), "public", logo.file.replace(/^\//, ""));
      expect(
        existsSync(path),
        `${logo.file} is missing. Either run "npm run logos:fetch" or reset SCHOOL_LOGOS to [] before committing.`,
      ).toBe(true);

      const bytes = readFileSync(path);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(logo.sha256);
      // Normalisation guarantees a square PNG frame, which is what lets the
      // renderer stop making per-asset decisions.
      expect(bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(true);
      expect(bytes.readUInt32BE(16)).toBe(bytes.readUInt32BE(20));
    },
  );
});
