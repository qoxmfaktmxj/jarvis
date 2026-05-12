#!/usr/bin/env node
/**
 * Fix-up sweep for two regex bugs in earlier scripts:
 *
 *   1. strip-pageheader-props.mjs glued <PageHeader to the next prop when the
 *      first prop was stripped on the same line:  `<PageHeadertitle=...`
 *      Fix: insert space between `<PageHeader` and the following identifier.
 *
 *   2. unify-page-size.mjs inserted the new `import { DEFAULT_PAGE_SIZE } …`
 *      line in the middle of a multi-line import (after the opening `{` line).
 *      Fix: hoist that import line above the multi-line import block.
 *
 * Idempotent — safe to re-run.
 */
import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join, sep } from "node:path";

const ROOT = process.cwd();
const TARGET = join(ROOT, "apps", "web", "app");

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
  let src = readFileSync(f, "utf8");
  const orig = src;

  // ---- Bug 1: <PageHeader<identifier> → <PageHeader <identifier>
  src = src.replace(/<PageHeader([A-Za-z])/g, "<PageHeader $1");

  // ---- Bug 2: hoist orphan DEFAULT_PAGE_SIZE import that landed inside a
  // multi-line import block (after the opening `{` line).
  // Pattern: `import {\n  import { DEFAULT_PAGE_SIZE } from "@jarvis/shared";\n`
  src = src.replace(
    /(import\s*\{\s*\n)(\s*import\s*\{\s*DEFAULT_PAGE_SIZE\s*\}\s*from\s*"@jarvis\/shared";\s*\n)/g,
    (_m, openLine, importLine) => importLine.replace(/^\s+/, "") + openLine,
  );

  if (src !== orig) {
    writeFileSync(f, src);
    touched++;
    console.log("fixed:", f.replace(ROOT + sep, "").replaceAll(sep, "/"));
  }
}
console.log(`\nTotal files fixed: ${touched}`);
