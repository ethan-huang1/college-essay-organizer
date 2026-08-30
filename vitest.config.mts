import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  // The same "@/*" -> "./src/*" alias tsconfig.json gives the app, so a module
  // under test can import the way the application imports rather than a second
  // way that exists only for the suite.
  resolve: {
    alias: [
      { find: /^@\//, replacement: `${fileURLToPath(new URL("./src", import.meta.url))}/` },
    ],
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Each persistence test boots an in-process Postgres and applies every
    // migration; the 10s default is too tight for that on a busy machine.
    hookTimeout: 30_000,
    // Same reason, for the tests themselves. The semantic-matching case
    // rescores the whole demo workspace four times with real embeddings: about
    // 4.4s alone, which cleared the 5s default only until another file was
    // competing for the CPU. Raising it fixes a flake rather than hiding one -
    // the test passes, it just does genuinely slow work.
    testTimeout: 30_000,
    // Semantic similarity is switched off for the suite so that every assertion
    // holds identically on a machine with the embedding model cached and one
    // without. A test whose result depends on whether a 25MB download has
    // happened is flaky, not passing - and the disabled path is the real
    // no-provider path, so pinning it pins real behaviour. embedding.test.ts
    // opts back in and skips itself when the model is genuinely absent.
    env: { DISABLE_LOCAL_EMBEDDINGS: "1" },
  },
});
