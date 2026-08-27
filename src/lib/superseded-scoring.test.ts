import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A grep assertion over src/, because "we removed the old scoring" is otherwise
 * only true until someone reintroduces half of it.
 *
 * docs/reuse-scoring.md replaced the previous design wholesale: a 60-point
 * primary bonus, an 80-point "ready to reuse" threshold, a corroboration gate, a
 * catalogue size factor, a classification confidence factor, a rank/badge split,
 * and word-count penalties. Any of those surviving alongside the four-factor
 * model would mean two designs deciding the same thing, with precedence quietly
 * choosing between them - which is exactly how the taxonomy ended up with two
 * contradicting override tables.
 */
const FORBIDDEN = [
  "ready-to-reuse",
  "minor-adaptation",
  "major-adaptation",
  "sizeFactor",
  "confidenceFactor",
  "wordCountPenalty",
  "primaryBonus",
  "rankScore",
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry) ? [path] : [];
  });
}

describe("superseded scoring design", () => {
  it("leaves no identifier from the previous design anywhere in src/", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles("src")) {
      const contents = readFileSync(file, "utf8");
      for (const [index, line] of contents.split("\n").entries()) {
        // This file names them all on purpose.
        if (file.endsWith("superseded-scoring.test.ts")) continue;
        for (const token of FORBIDDEN) {
          if (line.includes(token)) offenders.push(`${file}:${index + 1} ${token}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
