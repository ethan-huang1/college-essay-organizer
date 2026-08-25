import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Each persistence test boots an in-process Postgres and applies every
    // migration; the 10s default is too tight for that on a busy machine.
    hookTimeout: 30_000,
  },
});
