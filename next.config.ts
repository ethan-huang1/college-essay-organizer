import type { NextConfig } from "next";

/**
 * The five platform builds onnxruntime-node ships, of which a Linux x64 lambda
 * needs exactly one.
 *
 * Left in, the serverless function measured **219MB against Vercel's 250MB
 * limit** - 88% of the ceiling for binaries that can never execute there. These
 * four account for ~176MB of it.
 */
const UNUSED_ONNX_BINARIES = [
  "node_modules/onnxruntime-node/bin/napi-v6/win32/**",
  "node_modules/onnxruntime-node/bin/napi-v6/darwin/**",
  "node_modules/onnxruntime-node/bin/napi-v6/linux/arm64/**",
];

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
  outputFileTracingExcludes: {
    "/*": UNUSED_ONNX_BINARIES,
    "/": UNUSED_ONNX_BINARIES,
    "/[section]": UNUSED_ONNX_BINARIES,
  },
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
