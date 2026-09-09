import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // onnxruntime-node loads a native .node binary, which cannot be bundled.
  serverExternalPackages: ["better-sqlite3", "onnxruntime-node", "@huggingface/transformers"],
  /**
   * The embedding weights are read from disk at runtime rather than imported, so
   * nothing in the module graph points at them and file tracing would leave them
   * out - which is how they came to be missing from the first deployment.
   */
  /**
   * Keys are route globs, and the documented wildcard is `/*` - not `/**`, which
   * is what this first used and which silently matched nothing. A route group
   * does not appear in the URL, so the two routes that score matches are `/` and
   * `/[section]`; both are listed explicitly as well, because getting this wrong
   * fails in the worst way available - the build succeeds, the app runs, and one
   * factor of four quietly scores its neutral value forever.
   *
   * Verified by reading the generated .nft.json traces after a build, not by
   * trusting that the glob did what it looked like it did.
   */
  outputFileTracingIncludes: {
    // The two routes that score matches. Measured: Next applies this more
    // broadly than per-route anyway - every route's trace ends up with the
    // weights, and narrowing the keys did not change that. Left as the two real
    // consumers because that states the intent; the 23.7MB is shared across
    // functions rather than duplicated per function.
    "/": ["models/**"],
    "/[section]": ["models/**"],
  },
  /**
   * There is deliberately no `outputFileTracingExcludes` entry for the unused
   * onnxruntime platform binaries, though that is the obvious place for it.
   *
   * It does not work here: onnxruntime-node is in `serverExternalPackages`
   * because it loads a native .node file, and an external package is copied
   * wholesale rather than traced, so the excludes never applied. Measured across
   * real deployments - 2.96MB before the dependency, 219.19MB after, and still
   * 219.19MB with the excludes in place. They changed nothing.
   *
   * `scripts/prune-onnx-binaries.mjs`, wired to `prebuild`, deletes them instead.
   */
  /**
   * `/plans` is a local developer surface: it reads markdown from
   * ~/.claude/plans, a directory that does not exist on a deployed server. It
   * still cost a production Vercel Function, and Hobby allows only 12 per
   * deployment - which is exactly what broke deploys once the essay editor
   * added three routes and took the count to 13. Naming its page
   * `page.dev.tsx`, and accepting that extension only in development, means
   * the route does not exist in a production build at all - no function -
   * while `next dev` still serves it.
   */
  pageExtensions: process.env.NODE_ENV === "development"
    ? ["dev.tsx", "tsx", "ts", "jsx", "js"]
    : ["tsx", "ts", "jsx", "js"],
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
