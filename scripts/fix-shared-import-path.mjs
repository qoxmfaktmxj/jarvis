#!/usr/bin/env node
/**
 * Rewrite `import { DEFAULT_PAGE_SIZE } from "@jarvis/shared"` to the deeper
 * subpath `"@jarvis/shared/constants/pagination"`.
 *
 * Why: the root `@jarvis/shared` barrel re-exports `sentry.js` which imports
 * Sentry/OpenTelemetry node-only modules (`node:diagnostics_channel`, `node:net`).
 * Turbopack's client bundler cannot resolve those when a client component
 * (`"use client"`) pulls the root entry, producing 500 in dev.
 *
 * Idempotent.
 */
import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join, sep } from "node:path";

const ROOT = process.cwd();
const TARGET = join(ROOT, "apps", "web");

const SUBPATH = '"@jarvis/shared/constants/pagination"';

function walk(dir, out) {
  for (const e of readdirSync(dir)) {
    const full = join(dir, e);
    const s = statSync(full);
    if (s.isDirectory()) {
      if (e === "node_modules" || e === ".next") continue;
      walk(full, out);
    } else if (full.endsWith(".tsx") || full.endsWith(".ts")) {
      out.push(full);
    }
  }
}
const files = [];
walk(TARGET, files);

let touched = 0;
for (const f of files) {
  const orig = readFileSync(f, "utf8");
  // Only rewrite when the imported binding list is exactly `{ DEFAULT_PAGE_SIZE }`
  // (or includes it alone). We do not blanket-rewrite all `@jarvis/shared` uses
  // because other call sites legitimately need the root barrel.
  const next = orig.replace(
    /import\s*\{\s*DEFAULT_PAGE_SIZE\s*\}\s*from\s*"@jarvis\/shared";/g,
    `import { DEFAULT_PAGE_SIZE } from ${SUBPATH};`,
  );
  if (next !== orig) {
    writeFileSync(f, next);
    touched++;
    console.log("rewrote:", f.replace(ROOT + sep, "").replaceAll(sep, "/"));
  }
}
console.log(`\nTotal files rewritten: ${touched}`);
