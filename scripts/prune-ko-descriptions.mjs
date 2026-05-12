#!/usr/bin/env node
/**
 * Safely prune dead `"description"` keys from `apps/web/messages/ko.json`.
 *
 * Strategy:
 *   1. Walk ko.json. For each leaf path ending in `.description`, record the
 *      parent namespace path (e.g., `Admin.Companies` for `Admin.Companies.description`).
 *   2. For each candidate, search `apps/web/**` for any caller that:
 *        - calls `useTranslations("<parent>")` or `getTranslations("<parent>")`
 *        - AND in the same file references `t("description")`.
 *      Also check direct full-path usage: `t("<parent>.description")` from any
 *      caller (rare but possible — e.g., nested t").
 *   3. Remove only those keys with zero callers found.
 *
 * Conservative: false positives leave the key in place. Re-running is safe.
 *
 * Run from repo root:  node scripts/prune-ko-descriptions.mjs
 */
import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join, sep } from "node:path";

const ROOT = process.cwd();
const KO_JSON = join(ROOT, "apps", "web", "messages", "ko.json");
const SCAN_DIR = join(ROOT, "apps", "web");

const ko = JSON.parse(readFileSync(KO_JSON, "utf8"));

/** Collect every dotted path ending in `.description` (leaf string value). */
function collectDescriptionPaths(node, prefix, out) {
  if (node && typeof node === "object" && !Array.isArray(node)) {
    for (const k of Object.keys(node)) {
      const next = prefix ? `${prefix}.${k}` : k;
      if (k === "description" && typeof node[k] === "string") {
        out.push({ fullPath: next, parent: prefix });
      } else if (typeof node[k] === "object") {
        collectDescriptionPaths(node[k], next, out);
      }
    }
  }
}
const candidates = [];
collectDescriptionPaths(ko, "", candidates);

/** Read all `.tsx`/`.ts` files under apps/web. */
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
walk(SCAN_DIR, files);
const fileContents = files.map((f) => ({ f, src: readFileSync(f, "utf8") }));

const USE_RE = /(?:useTranslations|getTranslations)\(\s*["']([^"']+)["']\s*\)/g;

/** Build: namespace (e.g. "Admin.Companies") → set of files that call t("description") inside. */
const liveByNamespace = new Map();
for (const { src } of fileContents) {
  // Find all useTranslations / getTranslations namespaces in this file.
  const namespaces = new Set();
  let m;
  USE_RE.lastIndex = 0;
  while ((m = USE_RE.exec(src)) !== null) {
    namespaces.add(m[1]);
  }
  if (namespaces.size === 0) continue;
  // Does this file call t("description") anywhere?
  if (!/t\(\s*["']description["']\s*[,)]/.test(src)) continue;
  for (const ns of namespaces) {
    if (!liveByNamespace.has(ns)) liveByNamespace.set(ns, 0);
    liveByNamespace.set(ns, liveByNamespace.get(ns) + 1);
  }
}

/** Also catch direct path usage `t("<full>.description")` from any namespace. */
const liveByFullPath = new Set();
for (const c of candidates) {
  const escaped = c.fullPath.replace(/\./g, "\\.");
  const re = new RegExp(`t\\(\\s*["']${escaped}["']`);
  if (fileContents.some(({ src }) => re.test(src))) {
    liveByFullPath.add(c.fullPath);
  }
}

/** Decide removals. */
const toRemove = [];
for (const c of candidates) {
  const isLive = liveByNamespace.has(c.parent) || liveByFullPath.has(c.fullPath);
  if (!isLive) toRemove.push(c.fullPath);
}

if (toRemove.length === 0) {
  console.log("No dead `description` keys found.");
  process.exit(0);
}

console.log(`Pruning ${toRemove.length} dead description keys:`);
for (const p of toRemove) console.log("  -", p);

/** Apply removals. */
function deletePath(obj, parts) {
  if (parts.length === 1) {
    delete obj[parts[0]];
    return;
  }
  const [head, ...rest] = parts;
  if (obj[head] && typeof obj[head] === "object") {
    deletePath(obj[head], rest);
  }
}
for (const p of toRemove) deletePath(ko, p.split("."));

writeFileSync(KO_JSON, JSON.stringify(ko, null, 2) + "\n");
console.log(`\nWrote ${KO_JSON.replace(ROOT + sep, "")}`);
