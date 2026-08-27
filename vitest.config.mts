import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Each persistence test boots an in-process Postgres and applies every
    // migration; the 10s default is too tight for that on a busy machine.
    hookTimeout: 30_000,
    // Semantic similarity is switched off for the suite so that every assertion
    // holds identically on a machine with the embedding model cached and one
    // without. A test whose result depends on whether a 25MB download has
    // happened is flaky, not passing - and the disabled path is the real
    // no-provider path, so pinning it pins real behaviour. embedding.test.ts
    // opts back in and skips itself when the model is genuinely absent.
    env: { DISABLE_LOCAL_EMBEDDINGS: "1" },
  },
});
