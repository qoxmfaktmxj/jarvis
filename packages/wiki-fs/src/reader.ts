/**
 * High-level page reader for wiki pages.
 *
 * `readUtf8` (writer.ts) is path-agnostic — it just reads a file. page-first
 * navigation (packages/ai/page-first/*) + wiki lint both want a workspace-aware
 * helper that resolves `wiki/{workspaceId}/{relPath}` under `WIKI_ROOT`
 * (default `./wiki`, overridable via env — see README §WIKI_ROOT).
 *
 * Invariants:
 *   - `relPath` MUST NOT escape the workspace root. We block `..` segments
 *     defensively; callers should already be fetching from the DB index, so
 *     this is a belt-and-suspenders check against a future lint bug feeding
 *     arbitrary strings in.
 *   - Returns UTF-8 string with `\r\n` → `\n` normalization (same contract
 *     as `readUtf8`). Frontmatter + body stay intact; parsing happens in
 *     `parseFrontmatter` / `splitFrontmatter`.
 */

import * as path from "node:path";

import { readUtf8 } from "./writer.js";

/**
 * Resolve `WIKI_ROOT` from env once per process. `./wiki` fallback matches
 * README §WIKI_ROOT and local `docker compose` defaults.
 */
export function wikiRoot(): string {
  return path.resolve(process.env["WIKI_ROOT"] ?? "./wiki");
}

/**
 * Read a wiki page's raw markdown from disk.
 *
 * @param workspaceId UUID of the owning workspace.
 * @param relPath     path relative to `wiki/{workspaceId}/`, e.g.
 *                    `auto/entities/MindVault.md` or `manual/guides/foo.md`.
 *                    Either slash style works (we normalize).
 *
 * Throws `ENOENT`-wrapped error on missing file (callers should catch and
 * degrade — a stale DB index pointing at a deleted disk page is a known
 * transient state between ingest and lint).
 */
export async function readPage(
  workspaceId: string,
  relPath: string,
): Promise<string> {
  if (!workspaceId || workspaceId.includes("..")) {
    throw new Error(`wiki-fs.readPage: invalid workspaceId "${workspaceId}"`);
  }
  const normalized = relPath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (normalized.split("/").some((seg) => seg === "..")) {
    throw new Error(
      `wiki-fs.readPage: relPath must not escape workspace ("${relPath}")`,
    );
  }

  // If caller already passed a path that starts with `wiki/{workspaceId}/…`
  // (e.g. the index table stores full repo-relative paths from bootstrap),
  // strip that prefix so we don't double-nest.
  const stripped = normalized.startsWith(`wiki/${workspaceId}/`)
    ? normalized.slice(`wiki/${workspaceId}/`.length)
    : normalized;

  const absolute = path.join(wikiRoot(), workspaceId, stripped);
  return readUtf8(absolute);
}
