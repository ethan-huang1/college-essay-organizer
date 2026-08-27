import { beforeAll, describe, expect, it } from "vitest";

import {
  DISABLE_ENV_VAR,
  EMBEDDING_DIMENSIONS,
  calibrate,
  cosine,
  decodeVector,
  embedTexts,
  embeddingsAvailable,
  encodeVector,
  resetEmbeddingProviderForTests,
} from "./embedding";
import { PROMPT_VECTORS } from "./retrieval/prompt-vectors";
import { essayEmbeddingText, promptEmbeddingText } from "./semantic";

// Pure maths, no model needed: these run everywhere.
describe("calibration", () => {
  it("turns a compressed similarity band into a usable spread", () => {
    // Real cosines measured against this model for one essay. The signal is
    // real and lives in 0.02-0.25, which no absolute threshold could read.
    const z = calibrate([0.253, 0.141, 0.124, 0.120, 0.071, 0.066, 0.063, 0.056, 0.033, 0.020]);
    expect(z[0]).toBeGreaterThan(2);
    expect(z.at(-1)!).toBeLessThan(-1);
  });

  it("is invariant to scaling, so the model's absolute band cannot matter", () => {
    const raw = [0.1, 0.2, 0.3, 0.4];
    const scaled = calibrate(raw.map((value) => value * 7));
    for (const [index, value] of calibrate(raw).entries()) {
      expect(scaled[index]).toBeCloseTo(value, 10);
    }
  });

  it("returns zero when nothing distinguishes the prompts", () => {
    // "Everything is equally close" carries no information and must not be
    // amplified into a large positive or negative score.
    expect(calibrate([0.4, 0.4, 0.4])).toEqual([0, 0, 0]);
    expect(calibrate([0.4])).toEqual([0]);
    expect(calibrate([])).toEqual([]);
  });
});

describe("vector encoding", () => {
  it("round-trips a real embedding within quantisation error", () => {
    // Uses a committed vector rather than a synthetic one, because the error
    // depends on the distribution. A real 384-dimensional embedding has a peak
    // component around 0.2, so scaling by the peak buys most of the int8 range;
    // a synthetic vector with a peak near 1.0 gains nothing from it and is not
    // what this encoding is for.
    const vector = decodeVector(PROMPT_VECTORS[0][2]);
    expect(cosine(vector, decodeVector(encodeVector(vector)))).toBeGreaterThan(0.9999);
  });

  it("re-normalises, since quantisation costs the vector its unit length", () => {
    const decoded = decodeVector(PROMPT_VECTORS[0][2]);
    expect(cosine(decoded, decoded)).toBeCloseTo(1, 6);
  });

  it("stores one vector of the right size for every catalogue prompt", () => {
    expect(PROMPT_VECTORS).toHaveLength(255);
    for (const [school, ref, encoded] of PROMPT_VECTORS) {
      expect(decodeVector(encoded), `${school} / ${ref}`).toHaveLength(EMBEDDING_DIMENSIONS);
    }
  });
});

describe("embedding text", () => {
  it("separates fields with a sentence boundary, not a space", () => {
    // The same mistake in school-name detection made an essay opening "Brown
    // paper covered the table." read as a proper noun mid-sentence.
    expect(promptEmbeddingText("Why Duke", "What is your impression?")).toBe("Why Duke. What is your impression?");
  });

  it("truncates an essay rather than letting the model silently drop its tail", () => {
    const text = essayEmbeddingText("T", "word ".repeat(1000));
    expect(text.length).toBeLessThanOrEqual(1200);
  });
});

// The provider itself. Opts back out of the suite-wide disable, and skips rather
// than fails when the model is not downloaded - so this covers the real path on
// a developer machine without making the suite depend on a 25MB download.
describe("the local embedding provider", () => {
  let available = false;
  beforeAll(async () => {
    delete process.env[DISABLE_ENV_VAR];
    resetEmbeddingProviderForTests();
    available = await embeddingsAvailable();
  }, 120_000);

  it("ranks the prompt an essay actually answers above an unrelated one", async () => {
    if (!available) return;
    const essay = "The little free library outside our building was empty for a year, so I stopped trying to enforce returns and started increasing supply: a book drive, a deal with a used bookstore, a shelf I built badly and rebuilt well.";
    const vectors = await embedTexts([
      essay,
      "What have you done to make your school or your community a better place?",
      "Why do you want to study engineering at Princeton?",
    ]);
    expect(vectors).not.toBeNull();
    const [e, related, unrelated] = vectors!;
    expect(cosine(e, related)).toBeGreaterThan(cosine(e, unrelated));
  }, 120_000);

  it("reproduces the committed vectors, so the report stays reproducible", async () => {
    if (!available) return;
    const [school, ref, encoded] = PROMPT_VECTORS[0];
    const { lookupSchoolSource } = await import("./retrieval/registry");
    const prompt = lookupSchoolSource(school)?.prompts.find((candidate) => candidate.externalRef === ref);
    expect(prompt, `${school} / ${ref}`).toBeTruthy();
    const fresh = await embedTexts([promptEmbeddingText(prompt!.title, prompt!.promptText)]);
    // Quantisation is lossy, so this asserts the vectors still describe the same
    // direction - which is what would break if the model or the text changed.
    // With a per-vector scale the loss is under 0.01%; it was 1.1% with a fixed
    // scale, which is why the scale is stored per row.
    expect(cosine(fresh![0], decodeVector(encoded))).toBeGreaterThan(0.9995);
  }, 120_000);
});
