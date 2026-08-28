/**
 * Deletes the onnxruntime binaries a Linux serverless function cannot execute.
 *
 * Runs from `prebuild`, and **only on Vercel**. onnxruntime-node ships prebuilt
 * binaries for five platforms totalling ~210MB, of which a linux/x64 lambda uses
 * one. Deleting the rest is the difference between a function near Vercel's
 * 250MB ceiling and one with room in it.
 *
 * Why deletion rather than `outputFileTracingExcludes`, which is what this tried
 * first: the package is listed in `serverExternalPackages`, because it loads a
 * native .node file and cannot be bundled - and an external package is copied
 * wholesale, so tracing excludes never applied to it. Measured on real
 * deployments: 2.96MB before the dependency, 219.19MB after, and still 219.19MB
 * with the excludes in place. They did nothing.
 *
 * Guarded on process.env.VERCEL because deleting the darwin build locally would
 * break embedding on the machine this is developed on.
 */
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

const PLATFORMS_A_LINUX_LAMBDA_CANNOT_RUN = [
  "win32/x64",
  "win32/arm64",
  "darwin/x64",
  "darwin/arm64",
  "linux/arm64",
];

if (!process.env.VERCEL) {
  console.log("[prune-onnx] Not on Vercel; leaving every platform binary in place.");
  process.exit(0);
}

const root = join(process.cwd(), "node_modules", "onnxruntime-node", "bin", "napi-v6");
if (!existsSync(root)) {
  console.log("[prune-onnx] onnxruntime-node is not installed; nothing to prune.");
  process.exit(0);
}

let removed = 0;
for (const platform of PLATFORMS_A_LINUX_LAMBDA_CANNOT_RUN) {
  const path = join(root, platform);
  if (!existsSync(path)) continue;
  rmSync(path, { recursive: true, force: true });
  removed += 1;
  console.log(`[prune-onnx] removed ${platform}`);
}

// Fail loudly rather than shipping a function with no runtime at all.
const kept = join(root, "linux", "x64");
if (!existsSync(kept)) {
  console.error("[prune-onnx] linux/x64 is missing after pruning — refusing to continue.");
  process.exit(1);
}
console.log(`[prune-onnx] pruned ${removed} platform(s); linux/x64 retained.`);
