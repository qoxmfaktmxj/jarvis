/**
 * `[[wikilink]]` parser + renderer.
 *
 * Supports the three forms described in `WIKI-AGENTS.md` §3.1:
 *   - `[[page]]`                  → { target: "page" }
 *   - `[[page|label]]`            → { target: "page", alias: "label" }
 *   - `[[folder/page#anchor]]`    → { target: "folder/page", anchor: "anchor" }
 *
 * Design notes:
 *   - The regex is a superset of `reference_only/llm_wiki/src/lib/lint.ts`
 *     L30~37 but adds explicit anchor capture.
 *   - We *do not* resolve targets to on-disk paths here — that's the job
 *     of a later slug resolver that sees the page index. This module is
 *     pure string processing so it can run in the browser for preview.
 *   - `renderWikilinks` only replaces *parsed* links back; any `[[...]]`
 *     that fails the parser is emitted verbatim so LLM output with broken
 *     brackets doesn't corrupt further.
 */

import type { WikiLink } from "./types.js";

/**
 * Global regex matching `[[...]]`. We capture the inner text and then
 * split on `|` / `#` ourselves because embedded pipes inside the alias
 * are allowed (but anchors must come before aliases when both present).
 *
 * Grammar enforced:
 *   [[<target>(#<anchor>)?(|<alias>)?]]
 *
 * where <target> is any run of non-`]`, non-`|`, non-`#` characters
 * (including Korean).
 */
const WIKILINK_REGEX = /\[\[([^\]\n]+?)\]\]/g;

/**
 * Parse all wikilinks in `content`. Order-preserving: returned array
 * matches source reading order.
 */
export function parseWikilinks(content: string): WikiLink[] {
  const results: WikiLink[] = [];
  for (const match of content.matchAll(WIKILINK_REGEX)) {
    const inner = match[1];
    if (inner === undefined) continue;
    const parsed = parseInner(inner);
    if (parsed === null) continue;
    results.push({
      ...parsed,
      raw: match[0],
    });
  }
  return results;
}

/**
 * Parse a single `[[...]]` literal. Returns `null` if malformed (empty
 * target, etc.). Caller-friendly for tests.
 */
export function parseWikilink(literal: string): WikiLink | null {
  const trimmed = literal.trim();
  if (!trimmed.startsWith("[[") || !trimmed.endsWith("]]")) return null;
  const inner = trimmed.slice(2, -2);
  const parsed = parseInner(inner);
  if (parsed === null) return null;
  return { ...parsed, raw: trimmed };
}

/**
 * Replace each parsed wikilink with whatever `transform` returns. Useful
 * for rendering to HTML/MDX during query-time display. Non-parseable
 * `[[...]]` literals are left untouched.
 *
 * The transform receives the *parsed* `WikiLink` and should return the
 * replacement string (e.g. an `<a>` tag). Return the original `link.raw`
 * to leave it as-is.
 */
export function renderWikilinks(
  content: string,
  transform: (link: WikiLink) => string,
): string {
  return content.replace(WIKILINK_REGEX, (match, inner: string) => {
    const parsed = parseInner(inner);
    if (parsed === null) return match;
    return transform({ ...parsed, raw: match });
  });
}

/**
 * Build a canonical `[[...]]` literal from a `WikiLink`. Ordering:
 *   target[#anchor][|alias]
 */
export function formatWikilink(link: Omit<WikiLink, "raw">): string {
  let inner = link.target;
  if (link.anchor) inner += `#${link.anchor}`;
  if (link.alias) inner += `|${link.alias}`;
  return `[[${inner}]]`;
}

// ── internals ──────────────────────────────────────────────────────────

function parseInner(inner: string): Omit<WikiLink, "raw"> | null {
  let rest = inner.trim();
  if (rest.length === 0) return null;

  let alias: string | undefined;
  let anchor: string | undefined;

  // Split alias first (|) so that `#` inside the alias text stays intact.
  const pipeIdx = rest.indexOf("|");
  if (pipeIdx !== -1) {
    alias = rest.slice(pipeIdx + 1).trim();
    rest = rest.slice(0, pipeIdx).trim();
    if (alias.length === 0) alias = undefined;
  }

  const hashIdx = rest.indexOf("#");
  if (hashIdx !== -1) {
    anchor = rest.slice(hashIdx + 1).trim();
    rest = rest.slice(0, hashIdx).trim();
    if (anchor.length === 0) anchor = undefined;
  }

  const target = rest;
  if (target.length === 0) return null;

  const result: Omit<WikiLink, "raw"> = { target };
  if (alias !== undefined) result.alias = alias;
  if (anchor !== undefined) result.anchor = anchor;
  return result;
}
