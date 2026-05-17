#!/usr/bin/env node
/**
 * One-shot wiki frontmatter cleanup.
 *
 * Removes three deprecated top-level keys from every `.md` file under `wiki/`:
 *   - sensitivity         (policy 2026-05-12: row-level filter dropped; DB column already removed)
 *   - requiredPermission  (same policy; RBAC happens at route level)
 *   - authority           (redundant — directory path auto/ vs manual/ is SSoT)
 *
 * Behavior:
 *   - Walks wiki/**\/*.md
 *   - For each file: parses --- ... --- frontmatter block, drops matching
 *     top-level keys (column-0 key followed by ':'), preserves everything else
 *     byte-for-byte (no YAML re-serialization, so quote style / order untouched).
 *   - Skips files without a frontmatter block.
 *   - Skips files where none of the target keys appear.
 *
 * Flags:
 *   --dry      print summary + first 3 diffs, do not write
 *   --verbose  print every changed file path
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.cwd(), "wiki");
const DROP_KEYS = new Set(["sensitivity", "requiredPermission", "authority"]);
const DRY = process.argv.includes("--dry");
const VERBOSE = process.argv.includes("--verbose");

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile() && entry.name.endsWith(".md")) yield full;
  }
}

/**
 * Returns { content, droppedKeys } where droppedKeys is the list of top-level
 * keys actually removed from this file's frontmatter.
 */
function cleanFrontmatter(original) {
  // Detect CRLF vs LF without normalizing the body.
  const eol = original.includes("\r\n") ? "\r\n" : "\n";

  // Frontmatter must open on line 1 with '---'.
  if (!original.startsWith(`---${eol}`)) return { content: original, droppedKeys: [] };

  const afterOpen = original.slice(`---${eol}`.length);
  // Find closing '---' on its own line.
  const closeRegex = new RegExp(`${eol === "\r\n" ? "\\r\\n" : "\\n"}---(${eol === "\r\n" ? "\\r\\n" : "\\n"}|$)`);
  const closeMatch = closeRegex.exec(afterOpen);
  if (!closeMatch) return { content: original, droppedKeys: [] };

  const fmBlock = afterOpen.slice(0, closeMatch.index);
  const closeTerminator = closeMatch[0]; // includes the leading newline + ---  + trailing newline (or EOF)
  const body = afterOpen.slice(closeMatch.index + closeTerminator.length);

  const lines = fmBlock.split(eol);
  const out = [];
  const dropped = [];
  let skipIndentedUnder = null; // key currently being skipped — drop its indented continuation lines too

  for (const line of lines) {
    // Top-level key: starts at column 0 with letter/underscore, then key chars, then ':'.
    const keyMatch = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:/);
    if (keyMatch) {
      const key = keyMatch[1];
      if (DROP_KEYS.has(key)) {
        dropped.push(key);
        skipIndentedUnder = key;
        continue;
      }
      skipIndentedUnder = null;
      out.push(line);
      continue;
    }

    // Continuation lines under a dropped key (indented or empty within YAML block scalar) → drop.
    if (skipIndentedUnder !== null && (line.startsWith(" ") || line.startsWith("\t") || line === "")) {
      continue;
    }

    // Anything else (e.g. comment line at column 0) → reset skip and keep.
    skipIndentedUnder = null;
    out.push(line);
  }

  if (dropped.length === 0) return { content: original, droppedKeys: [] };

  const newFm = out.join(eol);
  const newContent = `---${eol}${newFm}${eol}---${closeTerminator.slice(closeTerminator.indexOf("---") + 3)}` + body;
  // Wait — closeTerminator already starts with eol then '---' then trailing.
  // We need: `---` + eol + newFm + eol + `---` + trailing.
  // Simpler: reconstruct from scratch.
  const trailingAfterClose = closeMatch[1]; // eol or empty (if EOF)
  const rebuilt = `---${eol}${newFm}${eol}---${trailingAfterClose}${body}`;
  return { content: rebuilt, droppedKeys: dropped };
}

function unifiedDiff(a, b, file, ctx = 2) {
  // Tiny line-based diff for human eyeballing; not git-quality.
  const aL = a.split(/\r?\n/);
  const bL = b.split(/\r?\n/);
  const lines = [];
  let i = 0,
    j = 0;
  while (i < aL.length || j < bL.length) {
    if (aL[i] === bL[j]) {
      i++;
      j++;
      continue;
    }
    // Heuristic: line in A but not in B near current position → deletion
    if (aL[i] !== undefined && !bL.slice(j, j + 3).includes(aL[i])) {
      lines.push(`- ${aL[i]}`);
      i++;
      continue;
    }
    if (bL[j] !== undefined && !aL.slice(i, i + 3).includes(bL[j])) {
      lines.push(`+ ${bL[j]}`);
      j++;
      continue;
    }
    i++;
    j++;
  }
  return `--- ${file}\n${lines.join("\n")}`;
}

const files = [...walk(ROOT)];
let changedCount = 0;
let writeCount = 0;
const keyHits = { sensitivity: 0, requiredPermission: 0, authority: 0 };
const sampleDiffs = [];

for (const f of files) {
  const orig = fs.readFileSync(f, "utf8");
  const { content: cleaned, droppedKeys } = cleanFrontmatter(orig);
  if (droppedKeys.length === 0) continue;
  changedCount++;
  for (const k of droppedKeys) keyHits[k] = (keyHits[k] ?? 0) + 1;

  if (sampleDiffs.length < 3) {
    sampleDiffs.push(unifiedDiff(orig, cleaned, path.relative(ROOT, f)));
  }
  if (VERBOSE) console.log(`changed: ${path.relative(ROOT, f)} (${droppedKeys.join(",")})`);

  if (!DRY) {
    fs.writeFileSync(f, cleaned, "utf8");
    writeCount++;
  }
}

console.log("");
console.log(`scanned : ${files.length}`);
console.log(`changed : ${changedCount}`);
console.log(`written : ${writeCount}${DRY ? " (DRY — no writes)" : ""}`);
console.log(`drop hits: sensitivity=${keyHits.sensitivity}  requiredPermission=${keyHits.requiredPermission}  authority=${keyHits.authority}`);
if (sampleDiffs.length > 0) {
  console.log("");
  console.log("=== sample diffs (first 3) ===");
  for (const d of sampleDiffs) {
    console.log(d);
    console.log("");
  }
}
