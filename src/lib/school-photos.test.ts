import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { SCHOOL_PHOTOS, photoForSchool, type SchoolPhoto } from "./school-photos";
import { TOP_UNIVERSITIES } from "./top-universities";

/**
 * These tests check that required provenance metadata is present and
 * internally consistent, and that each declared file exists at its declared
 * size.
 *
 * They do NOT and CANNOT establish that a photograph is legally usable, that
 * the licence is accurately reported, or that the image actually shows the
 * campus it claims to. Completeness is not permission. Those are human
 * judgements made before an entry is added.
 */

/** Intrinsic size from the file header, so a wrong width/height cannot ship. */
function webpSize(bytes: Buffer): { width: number; height: number } | null {
  if (bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WEBP") return null;
  const format = bytes.toString("ascii", 12, 16);
  if (format === "VP8X") {
    return {
      width: 1 + bytes.readUIntLE(24, 3),
      height: 1 + bytes.readUIntLE(27, 3),
    };
  }
  if (format === "VP8 ") {
    return {
      width: bytes.readUInt16LE(26) & 0x3fff,
      height: bytes.readUInt16LE(28) & 0x3fff,
    };
  }
  if (format === "VP8L") {
    const bits = bytes.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  return null;
}

const REQUIRED_TEXT: (keyof SchoolPhoto)[] = [
  "school",
  "file",
  "focus",
  "creator",
  "sourcePage",
  "license",
  "licenseUrl",
  "attribution",
  "modifications",
  "retrievedAt",
];

describe("school photo registry", () => {
  it("states plainly when it holds no photographs", () => {
    // Not a failure: every school falls back to its generated mark, which is a
    // finished state. This exists so the empty registry is a recorded decision.
    expect(Array.isArray(SCHOOL_PHOTOS)).toBe(true);
  });

  it("resolves a lookup for a school with no photograph to undefined", () => {
    expect(photoForSchool("A College With No Photograph")).toBeUndefined();
  });

  it.each(SCHOOL_PHOTOS.map((photo) => [photo.school, photo] as const))(
    "%s carries complete provenance",
    (_school, photo) => {
      for (const field of REQUIRED_TEXT) {
        expect(String(photo[field] ?? "").trim(), `${photo.school}: ${field} is empty`).not.toBe("");
      }
      expect(photo.licenseUrl).toMatch(/^https:\/\//);
      expect(photo.sourcePage).toMatch(/^https:\/\//);
      expect(photo.retrievedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      // A CDN URL is not a source page: it cannot be checked by a human later.
      expect(photo.sourcePage).not.toMatch(/\.(jpg|jpeg|png|webp)$/i);
    },
  );

  it.each(SCHOOL_PHOTOS.map((photo) => [photo.school, photo] as const))(
    "%s has a file at the declared size",
    (_school, photo) => {
      const path = join(process.cwd(), "public", photo.file.replace(/^\//, ""));
      expect(existsSync(path), `${photo.file} does not exist`).toBe(true);
      const size = webpSize(readFileSync(path));
      expect(size, `${photo.file} is not a readable WebP`).not.toBeNull();
      expect(size!.width).toBe(photo.width);
      expect(size!.height).toBe(photo.height);
      // 16:9 within a pixel of rounding, so the reserved box never reflows.
      expect(Math.abs(photo.width / photo.height - 16 / 9)).toBeLessThan(0.02);
    },
  );

  it("has no duplicate schools or files", () => {
    expect(new Set(SCHOOL_PHOTOS.map((photo) => photo.school)).size).toBe(SCHOOL_PHOTOS.length);
    expect(new Set(SCHOOL_PHOTOS.map((photo) => photo.file)).size).toBe(SCHOOL_PHOTOS.length);
  });

  it("names schools the catalogue actually knows", () => {
    const known = new Set(TOP_UNIVERSITIES);
    for (const photo of SCHOOL_PHOTOS) {
      expect(known.has(photo.school), `${photo.school} is not in TOP_UNIVERSITIES`).toBe(true);
    }
  });

  it("avoids licences with propagating conditions", () => {
    for (const photo of SCHOOL_PHOTOS) {
      expect(photo.license, `${photo.school} uses a share-alike licence`).not.toMatch(/BY-SA|ShareAlike/i);
    }
  });
});
