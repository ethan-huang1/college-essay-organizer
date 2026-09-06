import { describe, expect, it } from "vitest";

import { SCORING } from "./matching";

const { BAND_ORDER } = SCORING;
import {
  CALIBRATION_NEGATIVES, CALIBRATION_POSITIVES,
  HOLDOUT_NEGATIVES, HOLDOUT_POSITIVES,
  type NegativeCase, type PositiveCase,
} from "./reuse-cases";
import { caseLabel, scoreCase } from "./reuse-cases-scoring";

/**
 * The regression set, run as tests.
 *
 * These assertions are the contract the scoring redesign is held to, and they
 * are deliberately not symmetric: a positive pins the floor of its
 * `contentFitScore` and says nothing about its band, a negative pins the
 * ceiling of both. See the docblock in reuse-cases.ts for why.
 *
 * Every failure prints the factor breakdown and the semantic z-score, because
 * "expected 60, got 46" is not actionable and "category 0 of 40, semantic 39 of
 * 60, z=1.63" says exactly which signal is missing.
 */
const detail = (from: PositiveCase["from"], to: PositiveCase["to"]) => {
  const result = scoreCase(from, to);
  const factors = Object.entries(result.factors).map(([name, points]) => `${name} ${points}`).join(", ");
  return `${caseLabel(from, to)}\n  score ${result.score} (${factors}), z=${result.z?.toFixed(2) ?? "none"}, band ${result.recommendedAction}`;
};

const atOrBelow = (band: string, ceiling: string) =>
  BAND_ORDER.indexOf(band as never) <= BAND_ORDER.indexOf(ceiling as never);

describe("reuse regression set — calibration", () => {
  it.each(CALIBRATION_POSITIVES.map((c) => [caseLabel(c.from, c.to), c] as [string, PositiveCase]))(
    "surfaces %s", (_label, testCase) => {
      const result = scoreCase(testCase.from, testCase.to);
      expect(result.score, `${testCase.why}\n${detail(testCase.from, testCase.to)}`)
        .toBeGreaterThanOrEqual(testCase.minScore);
    },
  );

  it.each(CALIBRATION_NEGATIVES.map((c) => [caseLabel(c.from, c.to), c] as [string, NegativeCase]))(
    "holds down %s", (_label, testCase) => {
      const result = scoreCase(testCase.from, testCase.to);
      // Score first: a ceiling must not be what rescues a negative. A bad match
      // scoring 78 and held to `reusable-edits` by a word-count ceiling is
      // still a bad match - change the lengths and it surfaces.
      expect(result.score, `${testCase.why}\n${detail(testCase.from, testCase.to)}`)
        .toBeLessThanOrEqual(testCase.maxScore);
      expect(
        atOrBelow(result.recommendedAction, testCase.maxBand),
        `${testCase.why}: band ${result.recommendedAction} is above the ${testCase.maxBand} ceiling\n${detail(testCase.from, testCase.to)}`,
      ).toBe(true);
    },
  );
});

/**
 * The holdout, run once the design is locked.
 *
 * Skipped by default so that running the suite during tuning cannot leak it.
 * `REUSE_HOLDOUT=1 npm test` runs it. A failure here is a finding to report,
 * not a reason to adjust a weight and try again - the moment it is re-run after
 * re-tuning it stops being a holdout and becomes a second calibration set.
 */
const holdout = process.env.REUSE_HOLDOUT ? describe : describe.skip;

holdout("reuse regression set — sealed holdout", () => {
  it.each(HOLDOUT_POSITIVES.map((c) => [caseLabel(c.from, c.to), c] as [string, PositiveCase]))(
    "surfaces %s", (_label, testCase) => {
      const result = scoreCase(testCase.from, testCase.to);
      expect(result.score, `${testCase.why}\n${detail(testCase.from, testCase.to)}`)
        .toBeGreaterThanOrEqual(testCase.minScore);
    },
  );

  it.each(HOLDOUT_NEGATIVES.map((c) => [caseLabel(c.from, c.to), c] as [string, NegativeCase]))(
    "holds down %s", (_label, testCase) => {
      const result = scoreCase(testCase.from, testCase.to);
      expect(result.score, `${testCase.why}\n${detail(testCase.from, testCase.to)}`)
        .toBeLessThanOrEqual(testCase.maxScore);
      expect(
        atOrBelow(result.recommendedAction, testCase.maxBand),
        `${testCase.why}: band ${result.recommendedAction} is above the ${testCase.maxBand} ceiling\n${detail(testCase.from, testCase.to)}`,
      ).toBe(true);
    },
  );
});

describe("regression set hygiene", () => {
  it("never pairs two prompts from the same school as a positive", () => {
    // A school asking two questions wants two answers, so "one essay fits both"
    // is wrong there by construction however similar the wording. Duke asks
    // both "a community that shaped you" and "viewpoints and experiences", and
    // they sit close together in embedding space.
    const offenders = [...CALIBRATION_POSITIVES, ...HOLDOUT_POSITIVES]
      .filter((c) => c.from[0] === c.to[0])
      .map((c) => caseLabel(c.from, c.to));
    expect(offenders).toEqual([]);
  });

  it("names no prompt that has left the catalogue", () => {
    // scoreCase throws on an unknown key, so this fails loudly rather than
    // silently scoring a case against nothing after a catalogue rebuild.
    const all = [...CALIBRATION_POSITIVES, ...CALIBRATION_NEGATIVES, ...HOLDOUT_POSITIVES, ...HOLDOUT_NEGATIVES];
    for (const testCase of all) expect(() => scoreCase(testCase.from, testCase.to)).not.toThrow();
  });

  it("keeps the holdout disjoint from the calibration set", () => {
    // Overlap would make the holdout a copy of what was tuned on.
    const seen = new Set([...CALIBRATION_POSITIVES, ...CALIBRATION_NEGATIVES]
      .map((c) => `${c.from.join("|")}=>${c.to.join("|")}`));
    const leaked = [...HOLDOUT_POSITIVES, ...HOLDOUT_NEGATIVES]
      .filter((c) => seen.has(`${c.from.join("|")}=>${c.to.join("|")}`))
      .map((c) => caseLabel(c.from, c.to));
    expect(leaked).toEqual([]);
  });
});
