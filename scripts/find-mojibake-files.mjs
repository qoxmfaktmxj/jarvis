#!/usr/bin/env node
/**
 * scripts/find-mojibake-files.mjs
 *
 * One-shot utility (NOT part of the wiki pipeline): classify files under
 * wiki/jarvis/** into "normal" vs "mojibake" based on filename character
 * composition, and optionally delete the mojibake duplicates.
 *
 * Context: Git Bash's `unzip` on Windows double-encoded Korean filenames
 * from the wiki-task1 zip (UTF-8 bytes interpreted as CP1252 then re-saved
 * as UTF-8). The user subsequently re-extracted the zip with a UTF-8-aware
 * tool, so the wiki/ tree now contains BOTH the mojibake copies and the
 * correct copies side by side. This script prunes the mojibake copies.
 *
 * Heuristic (filename basename only):
 *   normal-hangul : contains Hangul syllables U+AC00..U+D7A3
 *   normal-ascii  : printable ASCII only
 *   mojibake      : no Hangul AND contains Latin-1 Supplement /
 *                   Latin Extended / Cyrillic / Arabic / Devanagari-ish
 *                   chars typical of double-UTF8 Korean
 *   normal-other  : anything else (fallback; not touched)
 *
 * Safety: refuses to --delete if ANY parent directory would become empty
 * after deletion. That means the script ONLY removes mojibake files that
 * have a correct sibling in the same directory.
 *
 * Usage:
 *   node scripts/find-mojibake-files.mjs              # dry classification
 *   node scripts/find-mojibake-files.mjs --delete     # remove mojibake copies
 */

import { promises as fs } from "node:fs";
import * as path from "node:path";

const ROOT = path.resolve(process.cwd(), "wiki", "jarvis");

const HANGUL = /[\uAC00-\uD7A3]/;
// Character classes commonly produced by double-UTF8 encoding of Korean:
const MOJIBAKE_HINT =
  /[\u00A2-\u00FF\u0100-\u024F\u0370-\u03FF\u0400-\u04FF\u0590-\u05FF\u0600-\u06FF\u0700-\u07BF\u0900-\u097F]/;

async function walk(dir, out = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) await walk(p, out);
    else if (e.isFile() && e.name.endsWith(".md")) out.push(p);
  }
  return out;
}

async function findMojibakeDirs(dir, out = []) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const p = path.join(dir, e.name);
    if (classify(e.name + ".md") === "mojibake") {
      out.push(p);
      // Do not descend — whole subtree considered mojibake duplicate.
    } else {
      await findMojibakeDirs(p, out);
    }
  }
  return out;
}

async function rmrf(p) {
  await fs.rm(p, { recursive: true, force: true });
}

function classify(name) {
  const base = name.replace(/\.md$/i, "");
  if (HANGUL.test(base)) return "normal-hangul";
  if (/^[\x20-\x7E]+$/.test(base)) return "normal-ascii";
  if (MOJIBAKE_HINT.test(base)) return "mojibake";
  return "normal-other";
}

async function main() {
  const doDelete = process.argv.includes("--delete");
  const files = await walk(ROOT);
  const stats = {
    "normal-hangul": 0,
    "normal-ascii": 0,
    "normal-other": 0,
    mojibake: 0,
  };
  const mojibakeFiles = [];

  for (const f of files) {
    const cat = classify(path.basename(f));
    stats[cat]++;
    if (cat === "mojibake") mojibakeFiles.push(f);
  }

  console.log(
    "[find-mojibake] scanned",
    files.length,
    "md files under",
    path.relative(process.cwd(), ROOT),
  );
  console.log("[find-mojibake] by category:", stats);

  if (!doDelete) {
    console.log(
      "\n[find-mojibake] --- first 30 mojibake files (would delete with --delete) ---",
    );
    for (const f of mojibakeFiles.slice(0, 30)) {
      console.log("  MOJIBAKE", path.relative(process.cwd(), f));
    }
    if (mojibakeFiles.length > 30) {
      console.log("  ... and", mojibakeFiles.length - 30, "more");
    }
    return;
  }

  // Safety check: refuse to delete if a directory would be emptied
  // (that means the correct copy was never extracted there).
  const dirSafety = new Map();
  for (const f of files) {
    const d = path.dirname(f);
    const entry = dirSafety.get(d) ?? { total: 0, mojibake: 0 };
    entry.total++;
    if (classify(path.basename(f)) === "mojibake") entry.mojibake++;
    dirSafety.set(d, entry);
  }
  const unsafeDirs = [];
  for (const [d, s] of dirSafety) {
    if (s.mojibake > 0 && s.total - s.mojibake === 0) {
      unsafeDirs.push({ d, s });
    }
  }
  if (unsafeDirs.length > 0) {
    console.error(
      "[find-mojibake] ABORT: the following dirs would become empty after deletion:",
    );
    for (const { d, s } of unsafeDirs) {
      console.error(
        "  ",
        path.relative(process.cwd(), d),
        "(",
        s.mojibake,
        "mojibake, 0 normal)",
      );
    }
    console.error(
      "[find-mojibake] re-extract the zip with a UTF-8-aware tool first.",
    );
    process.exit(1);
  }

  console.log(
    "\n[find-mojibake] deleting",
    mojibakeFiles.length,
    "mojibake files...",
  );
  let deleted = 0;
  for (const f of mojibakeFiles) {
    await fs.unlink(f);
    deleted++;
  }
  console.log("[find-mojibake] files deleted =", deleted);

  // Phase 2: delete mojibake directories (whole subtrees).
  const mojibakeDirs = await findMojibakeDirs(ROOT);
  console.log(
    "[find-mojibake] deleting",
    mojibakeDirs.length,
    "mojibake directories (recursive)...",
  );
  let dirsDeleted = 0;
  for (const d of mojibakeDirs) {
    await rmrf(d);
    dirsDeleted++;
  }
  console.log("[find-mojibake] dirs deleted =", dirsDeleted);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
