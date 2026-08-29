import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { MARK_COLOURS, schoolInitials } from "./school-mark";

// Parses the real token file rather than a copy of the values, so a colour
// cannot be changed in the design system without this test seeing it.
const TOKENS = readFileSync(join(import.meta.dirname, "styles/tokens.css"), "utf8");

function colours(): Map<string, string> {
  const found = new Map<string, string>();
  for (const [, name, hex] of TOKENS.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})\s*;/gi)) {
    found.set(name, hex);
  }
  return found;
}

/** WCAG 2.1 relative luminance. */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((offset) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function ratio(foreground: string, background: string): number {
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Text a student actually reads: WCAG AA requires 4.5:1. */
const TEXT: [string, string][] = [
  ["ink", "ground"],
  ["ink", "surface"],
  ["ink", "surface-sunk"],
  ["ink-soft", "ground"],
  ["ink-soft", "surface"],
  ["ink-soft", "surface-sunk"],
  ["brand", "ground"],
  ["brand", "surface"],
  ["brand", "brand-soft"],
  ["nav-ink", "nav"],
  ["nav-ink-soft", "nav"],
  ["ok-ink", "ok-tint"],
  ["ok-ink", "surface"],
  ["warn-ink", "warn-tint"],
  ["warn-ink", "surface"],
  ["caution-ink", "caution-tint"],
  ["caution-ink", "surface"],
  ["risk-ink", "risk-tint"],
  ["risk-ink", "surface"],
  ["info-ink", "info-tint"],
  ["info-ink", "surface"],
  ["quiet-ink", "quiet-tint"],
  ["quiet-ink", "surface"],
];

/** Boundaries of things you operate: WCAG AA requires 3:1. */
const UI: [string, string][] = [
  ["line-strong", "surface"],
  ["line-strong", "ground"],
  ["focus", "ground"],
  ["focus", "surface"],
  ["focus", "surface-sunk"],
  ["focus-nav", "nav"],
];

// Fills and hairlines that separate two surfaces are not UI-component
// boundaries: a card reads as a card because it is white on cream, and a pill
// always carries its own text, so neither depends on its border to be
// perceived. They are listed here so the omission is a decision on the record
// rather than an oversight.
const DECORATIVE = new Set(["line", "line-soft"]);

describe("colour tokens", () => {
  const palette = colours();

  it("parses the token file", () => {
    expect(palette.size).toBeGreaterThan(20);
    expect(palette.get("ground")).toBe("#f7f4ed");
  });

  it.each(TEXT)("%s on %s reaches AA for text (4.5:1)", (foreground, background) => {
    const front = palette.get(foreground);
    const back = palette.get(background);
    expect(front, `--${foreground} is not defined`).toBeDefined();
    expect(back, `--${background} is not defined`).toBeDefined();
    expect(ratio(front!, back!)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(UI)("%s on %s reaches AA for UI boundaries (3:1)", (foreground, background) => {
    const front = palette.get(foreground);
    const back = palette.get(background);
    expect(front, `--${foreground} is not defined`).toBeDefined();
    expect(back, `--${background} is not defined`).toBeDefined();
    expect(ratio(front!, back!)).toBeGreaterThanOrEqual(3);
  });

  it("gives every school mark legible white initials", () => {
    for (const colour of MARK_COLOURS) {
      expect(ratio("#ffffff", colour), `white initials on ${colour}`).toBeGreaterThanOrEqual(4.5);
      // 3:1 against the card surface, so the circle's edge shows unaided.
      expect(ratio(colour, "#ffffff"), `${colour} against --surface`).toBeGreaterThanOrEqual(3);
    }
  });

  it("uses distinct mark colours", () => {
    expect(new Set(MARK_COLOURS).size).toBe(MARK_COLOURS.length);
  });

  it("checks every colour in the palette", () => {
    const checked = new Set([...TEXT, ...UI].flat());
    const unchecked = [...palette.keys()].filter(
      (name) => !checked.has(name) && !DECORATIVE.has(name),
    );
    expect(unchecked, "add these to TEXT/UI or to DECORATIVE with a reason").toEqual([]);
  });
});

describe("school initials", () => {
  // Naive initials render half a college list as "U".
  it.each([
    ["New York University", "NY"],
    ["University of Pennsylvania", "Pe"],
    ["University of California, Berkeley", "CB"],
    ["Massachusetts Institute of Technology", "MT"],
    ["Brown University", "Br"],
    ["Boston College", "Bo"],
  ])("%s -> %s", (name, expected) => {
    expect(schoolInitials(name)).toBe(expected);
  });

  it("never returns an empty mark", () => {
    for (const name of ["University", "of the", "X", "第一大学"]) {
      expect(schoolInitials(name).length).toBeGreaterThan(0);
    }
  });
});
