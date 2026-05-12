#!/usr/bin/env node
/**
 * One-shot sweep: replace hard-coded page-size literals at primary call sites
 * with the shared `DEFAULT_PAGE_SIZE` constant.
 *
 * Targets:
 *   - `const PAGE_SIZE = 20|50;` (grid container / page module constants)
 *   - `const limit = 50;` (page.tsx local for server-side default)
 *
 * Skips:
 *   - test files (__tests__, *.test.*)
 *   - `holidays/_components/HolidaysGridContainer.tsx` (intentional 100)
 *   - `admin/menus/page.tsx` (intentional 200 — full menu tree)
 *   - `sales/_lib/finance-actions.ts` (intentional throwaway/fallback)
 *
 * Run from repo root:  node scripts/unify-page-size.mjs
 */
import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join, sep } from "node:path";

const ROOT = process.cwd();
const TARGET_DIRS = [
  join(ROOT, "apps", "web", "app"),
];

const EXCLUDE = [
  /__tests__/,
  /\.test\.[tj]sx?$/,
  /HolidaysGridContainer\.tsx$/,
  /admin[\/\\]menus[\/\\]page\.tsx$/,
  /sales[\/\\]_lib[\/\\]finance-actions\.ts$/,
];

const SHARED_IMPORT = `import { DEFAULT_PAGE_SIZE } from "@jarvis/shared";`;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) {
      if (entry === "node_modules" || entry === ".next") continue;
      walk(full, out);
    } else if (full.endsWith(".tsx") || full.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

function ensureImport(src) {
  if (src.includes("DEFAULT_PAGE_SIZE")) {
    // Already present — but the import line itself may be missing if we just
    // introduced a usage. Check that an import line exists.
    if (/from\s+["']@jarvis\/shared["']/.test(src) && /DEFAULT_PAGE_SIZE/.test(src.split("\n").filter((l) => l.startsWith("import")).join("\n"))) {
      return src;
    }
  }

  // Try to merge into an existing `@jarvis/shared` import (single-line form)
  const existingShared = src.match(/^import\s+\{([^}]+)\}\s+from\s+["']@jarvis\/shared["'];?$/m);
  if (existingShared) {
    const names = existingShared[1].split(",").map((s) => s.trim()).filter(Boolean);
    if (!names.includes("DEFAULT_PAGE_SIZE")) {
      names.push("DEFAULT_PAGE_SIZE");
      const newLine = `import { ${names.join(", ")} } from "@jarvis/shared";`;
      return src.replace(existingShared[0], newLine);
    }
    return src;
  }

  // Otherwise prepend after the last top-level import block
  const lines = src.split("\n");
  let lastImportIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^import\s/.test(lines[i])) lastImportIdx = i;
    else if (lastImportIdx !== -1 && lines[i].trim() === "") continue;
    else if (lastImportIdx !== -1) break;
  }
  if (lastImportIdx === -1) {
    return SHARED_IMPORT + "\n" + src;
  }
  lines.splice(lastImportIdx + 1, 0, SHARED_IMPORT);
  return lines.join("\n");
}

function rewrite(src, file) {
  let changed = false;
  let out = src;

  // const PAGE_SIZE = 20|50; → const PAGE_SIZE = DEFAULT_PAGE_SIZE;
  out = out.replace(/(\bconst\s+PAGE_SIZE\s*=\s*)(20|50)(\s*;)/g, (_m, p1, _n, p3) => {
    changed = true;
    return `${p1}DEFAULT_PAGE_SIZE${p3}`;
  });

  // const limit = 50; (page.tsx) → const limit = DEFAULT_PAGE_SIZE;
  out = out.replace(/(\bconst\s+limit\s*=\s*)50(\s*;)/g, (_m, p1, p2) => {
    changed = true;
    return `${p1}DEFAULT_PAGE_SIZE${p2}`;
  });

  // page.tsx only: `{ page: 1, limit: 50 }` initial-fetch pattern (any whitespace).
  // Don't touch actions.ts / export.ts (those are throwaway / Zod-cap workarounds).
  if (/[\/\\]page\.tsx$/.test(file)) {
    out = out.replace(
      /(\bpage\s*:\s*1\s*,\s*\n?\s*limit\s*:\s*)50(\s*[,\n}])/g,
      (_m, p1, p2) => {
        changed = true;
        return `${p1}DEFAULT_PAGE_SIZE${p2}`;
      },
    );
    // multi-line variant: `limit:        50,` standalone in initial fetch
    out = out.replace(
      /(\blimit\s*:\s*)50(\s*,)/g,
      (m, p1, p2) => {
        // Skip if this line is inside an error-return object (heuristic: surrounding 80 chars contains `error:` or `ok: false`)
        const matchIndex = out.indexOf(m);
        const context = out.slice(Math.max(0, matchIndex - 120), matchIndex + 50);
        if (/\bok\s*:\s*false\b/.test(context)) return m;
        if (/\berror\s*:/.test(context)) return m;
        changed = true;
        return `${p1}DEFAULT_PAGE_SIZE${p2}`;
      },
    );
  }

  if (changed) out = ensureImport(out);
  return { src: out, changed };
}

const files = [];
for (const d of TARGET_DIRS) walk(d, files);
let touched = 0;
for (const f of files) {
  if (EXCLUDE.some((re) => re.test(f))) continue;
  const orig = readFileSync(f, "utf8");
  const { src: next, changed } = rewrite(orig, f);
  if (changed && next !== orig) {
    writeFileSync(f, next);
    touched++;
    const rel = f.replace(ROOT + sep, "").replaceAll(sep, "/");
    console.log("updated:", rel);
  }
}
console.log(`\nTotal files modified: ${touched}`);
