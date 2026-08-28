import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { EMBEDDING_MODEL } from "./embedding";
import { PROMPT_VECTOR_MODEL } from "./retrieval/prompt-vectors";

/**
 * Guards the way this feature fails: silently.
 *
 * With the weights absent from a deployment the build still succeeds, the app
 * still runs, and semantic similarity scores its neutral value forever - one
 * factor of four quietly inert, producing lower scores with no error anywhere.
 * That is exactly what shipped on the first production deployment, so it is
 * asserted here rather than left to be noticed.
 */
describe("the embedding model ships with the app", () => {
  const modelDir = join(process.cwd(), "models", EMBEDDING_MODEL);
  const config = readFileSync(join(process.cwd(), "next.config.ts"), "utf8");

  it("keeps the weights committed, not gitignored", () => {
    for (const file of ["config.json", "tokenizer.json", "tokenizer_config.json", "onnx/model_quantized.onnx"]) {
      expect(existsSync(join(modelDir, file)), `${file} is missing from models/${EMBEDDING_MODEL}`).toBe(true);
    }
    // An existence check alone would pass on a truncated file or an LFS pointer.
    expect(statSync(join(modelDir, "onnx/model_quantized.onnx")).size).toBeGreaterThan(20_000_000);
  });

  it("tells the serverless build to include them", () => {
    // The weights are read from disk at runtime, so nothing in the module graph
    // points at them and file tracing would otherwise leave them out.
    expect(config).toContain("outputFileTracingIncludes");
    expect(config).toMatch(/models\/\*\*/);
  });

  it("keeps the committed prompt vectors and the model in step", () => {
    // Vectors produced by one model are meaningless against another's.
    expect(PROMPT_VECTOR_MODEL).toBe(EMBEDDING_MODEL);
  });

  it("excludes the platform binaries a Linux lambda cannot run", () => {
    // 210MB of onnxruntime across five platforms took the function to 219MB of a
    // 250MB limit. Only linux/x64 is reachable there.
    expect(config).toContain("outputFileTracingExcludes");
    for (const platform of ["win32", "darwin", "linux/arm64"]) {
      expect(config, `${platform} binaries should be excluded`).toContain(platform);
    }
  });
});
