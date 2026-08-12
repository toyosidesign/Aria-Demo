/**
 * Teaches plain `node` the `@/*` path alias from tsconfig.json.
 *
 * The security tests import the real source files rather than copies, so they
 * cannot drift from what ships. Those files import each other as `@/lib/...`,
 * which Metro resolves but bare node does not, hence this hook. Node 22.6+
 * strips the type annotations itself, so no build step is involved.
 */

import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '../..');

/** Mirrors tsconfig's `paths`: `@/*` → `./src/*`, trying the usual extensions. */
function resolveAlias(specifier) {
  const base = path.join(ROOT, 'src', specifier.slice(2));
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

export async function resolve(specifier, context, next) {
  if (specifier.startsWith('@/')) {
    const hit = resolveAlias(specifier);
    if (hit) return next(pathToFileURL(hit).href, context);
  }
  return next(specifier, context);
}
