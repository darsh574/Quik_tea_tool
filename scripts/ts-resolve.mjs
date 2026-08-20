// Resolve hook so the `scripts/check-*.mjs` self-checks can import the app's
// .ts sources directly. Next/tsc resolve extensionless relative imports
// (`./constants`); bare Node does not. Maps `./x` → `./x.ts` when that file
// exists, and otherwise gets out of the way.
//
// Used via: node --import ./scripts/ts-register.mjs scripts/check-foo.mjs
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

export async function resolve(specifier, context, next) {
  if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) {
    const candidate = `${specifier}.ts`;
    const url = new URL(candidate, context.parentURL);
    if (existsSync(fileURLToPath(url))) return next(candidate, context);
  }
  return next(specifier, context);
}
