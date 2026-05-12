#!/usr/bin/env node
/**
 * One-shot sweep: remove deprecated PageHeader props
 * (`eyebrow`, `kicker`, `description`, `subtitle`) from every call site.
 *
 * PageHeader.tsx was simplified to render only `title` + `actions`; the props
 * still compile (deprecated no-ops) but should not appear at call sites.
 *
 * Run from repo root:  node scripts/strip-pageheader-props.mjs
 */
import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join, sep } from "node:path";

const ROOT = process.cwd();
const TARGET_DIR = join(ROOT, "apps", "web", "app");
const DEPRECATED_PROPS = ["eyebrow", "kicker", "description", "subtitle"];
const TARGET_EXTS = [".tsx", ".ts"];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) {
      if (entry === "node_modules" || entry === ".next") continue;
      walk(full, out);
    } else if (TARGET_EXTS.some((ext) => full.endsWith(ext))) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Strip a single prop assignment ` name="..."` or ` name={...}` from a string.
 * Supports nested braces in expressions. Returns the trimmed string.
 */
function stripPropFromBody(body, propName) {
  // Quick exit: prop name absent
  const re = new RegExp(`\\b${propName}\\s*=`, "g");
  if (!re.test(body)) return body;

  let out = "";
  let i = 0;
  while (i < body.length) {
    const remaining = body.slice(i);
    const m = remaining.match(new RegExp(`(?:^|\\s)${propName}\\s*=`));
    if (!m) {
      out += remaining;
      break;
    }
    const matchStart = i + m.index;
    const matchEnd = i + m.index + m[0].length;
    out += body.slice(i, matchStart);

    // Skip whitespace after `=`
    let j = matchEnd;
    while (j < body.length && /\s/.test(body[j])) j++;

    // Consume the value
    if (body[j] === '"' || body[j] === "'") {
      const quote = body[j];
      j++;
      while (j < body.length && body[j] !== quote) {
        if (body[j] === "\\") j += 2;
        else j++;
      }
      if (j < body.length) j++;
    } else if (body[j] === "{") {
      let depth = 1;
      j++;
      while (j < body.length && depth > 0) {
        if (body[j] === "{") depth++;
        else if (body[j] === "}") depth--;
        if (depth > 0) j++;
      }
      if (j < body.length) j++;
    }

    // Eat trailing whitespace/comma on same construct
    while (j < body.length && /[ \t]/.test(body[j])) j++;
    if (body[j] === "\n" || body[j] === "\r") {
      while (j < body.length && /[\r\n]/.test(body[j])) j++;
    }

    i = j;
  }

  // Collapse multiple blank lines created by removal
  return out.replace(/\n[ \t]*\n[ \t]*\n+/g, "\n\n");
}

/**
 * Find each <PageHeader ... /> or <PageHeader ...></PageHeader> block,
 * strip the deprecated props from inside, return new source.
 */
function rewriteFile(src) {
  const open = "<PageHeader";
  let out = "";
  let i = 0;
  let changed = false;

  while (i < src.length) {
    const idx = src.indexOf(open, i);
    if (idx === -1) {
      out += src.slice(i);
      break;
    }
    out += src.slice(i, idx);

    // Find matching close ('/>' or '>')
    let j = idx + open.length;
    let depth = 0; // braces depth
    let inStr = null;
    let closed = -1;
    let isSelfClose = false;
    while (j < src.length) {
      const ch = src[j];
      if (inStr) {
        if (ch === "\\") {
          j += 2;
          continue;
        }
        if (ch === inStr) inStr = null;
      } else if (ch === '"' || ch === "'") {
        inStr = ch;
      } else if (ch === "{") {
        depth++;
      } else if (ch === "}") {
        depth--;
      } else if (depth === 0 && ch === "/" && src[j + 1] === ">") {
        closed = j;
        isSelfClose = true;
        break;
      } else if (depth === 0 && ch === ">") {
        closed = j;
        isSelfClose = false;
        break;
      }
      j++;
    }
    if (closed === -1) {
      // malformed; bail
      out += src.slice(idx);
      break;
    }

    const body = src.slice(idx + open.length, closed);
    let newBody = body;
    for (const prop of DEPRECATED_PROPS) {
      newBody = stripPropFromBody(newBody, prop);
    }
    if (newBody !== body) changed = true;

    out += open + newBody + (isSelfClose ? "/>" : ">");
    i = closed + (isSelfClose ? 2 : 1);
  }

  return { src: out, changed };
}

const files = walk(TARGET_DIR);
let touched = 0;
for (const f of files) {
  const orig = readFileSync(f, "utf8");
  if (!orig.includes("<PageHeader")) continue;
  const { src: next, changed } = rewriteFile(orig);
  if (changed && next !== orig) {
    writeFileSync(f, next);
    touched++;
    const rel = f.replace(ROOT + sep, "").replaceAll(sep, "/");
    console.log("stripped:", rel);
  }
}
console.log(`\nTotal files modified: ${touched}`);
