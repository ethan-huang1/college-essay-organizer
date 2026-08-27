// Lets `node --experimental-strip-types` load this repo's extensionless TS
// imports, which is how every file under src/ is written.
//
// Node's own resolver requires an explicit extension under --experimental-strip-types,
// so `import { x } from "./sources/amherst"` fails with ERR_MODULE_NOT_FOUND even
// though tsc and Next resolve it fine. Scripts can add `.ts` to their own imports,
// but not to the hundreds inside src/, so a script that reaches any of it needs
// this hook:
//
//   node --experimental-strip-types --import ./scripts/ts-resolve.mjs scripts/whatever.mts
//
// Note also that `node --check` does not resolve imports at all, so it cannot
// prove a script like this runs - only running it can.
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    const relative = specifier.startsWith("./") || specifier.startsWith("../");
    const absolute = specifier.startsWith("file://") || specifier.startsWith("/");
    const hasExtension = /\.([cm]?[jt]sx?|json|node)$/.test(specifier);
    if ((relative || absolute) && !hasExtension) {
      for (const candidate of [`${specifier}.ts`, `${specifier}.tsx`, `${specifier}/index.ts`, `${specifier}/index.tsx`]) {
        try {
          return nextResolve(candidate, context);
        } catch {
          // Try the next shape; fall through to Node's own error if none work.
        }
      }
    }
    return nextResolve(specifier, context);
  },
});
