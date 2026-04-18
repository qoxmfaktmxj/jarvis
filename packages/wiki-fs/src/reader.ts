/**
 * High-level page reader for wiki pages.
 *
 * Disk layout: `{WIKI_ROOT}/{workspace.code}/{relPath}` where `workspace.code`
 * is the human slug (e.g. `jarvis`), NOT the UUID. The DB (`wiki_page_index.path`)
 * stores the full repo-relative path `wiki/{code}/{relPath}`, so the reader
 * strips `wiki/<anything>/` prefix generically and re-resolves against
 * `WIKI_ROOT + workspaceDir`.
 *
 * Invariants:
 *   - `relPath` MUST NOT escape the workspace root. We block `..` segments
 *     defensively; callers should already be fetching from the DB index, so
 *     this is a belt-and-suspenders check against a future lint bug feeding
 *     arbitrary strings in.
 *   - Returns UTF-8 string with `\r\n` → `\n` normalization.
 */

import * as path from "node:path";

import { readUtf8 } from "./writer.js";

/**
 * Resolve the wiki root directory.
 *
 * Resolution order:
 *   1. `WIKI_ROOT` — explicit override pointing directly at the wiki/ dir.
 *   2. `WIKI_REPO_ROOT` — repo root used by apps/web; we append `/wiki`.
 *      Keeps a single source of truth when both packages run in the same
 *      process (avoids env drift between `wiki-fs` and `apps/web`).
 *   3. `./wiki` — matches `docker compose` defaults when cwd is the repo root.
 */
export function wikiRoot(): string {
  const direct = process.env["WIKI_ROOT"];
  if (direct && direct.trim().length > 0) {
    return path.resolve(direct);
  }
  const repoRoot = process.env["WIKI_REPO_ROOT"];
  if (repoRoot && repoRoot.trim().length > 0) {
    return path.resolve(repoRoot, "wiki");
  }
  return path.resolve("./wiki");
}

// 메모: workspace.id → workspace.code 룩업은 DB 없이는 불가 — 여기선 캐시 전역에
// 둬서 caller가 미리 넣게 한다. 없으면 UUID 자체를 디렉토리명으로 폴백.
const workspaceDirCache = new Map<string, string>();

export function registerWorkspaceDir(workspaceId: string, dirName: string): void {
  workspaceDirCache.set(workspaceId, dirName);
}

/**
 * Read a wiki page's raw markdown from disk.
 *
 * @param workspaceId UUID of the owning workspace.
 * @param relPath     path from `wiki_page_index.path`, typically
 *                    `wiki/{code}/auto/entities/Foo.md`. Slash style normalized.
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

  // DB가 `wiki/{code}/...` 로 저장하고 있다고 가정. `wiki/<anything>/` prefix를
  // generic하게 벗겨내고 그 첫 세그먼트를 workspaceDir로 채택.
  let workspaceDir = workspaceDirCache.get(workspaceId) ?? workspaceId;
  let stripped = normalized;
  const m = normalized.match(/^wiki\/([^/]+)\/(.+)$/);
  if (m) {
    workspaceDir = m[1]!;
    stripped = m[2]!;
    // 캐시 (다음 호출에서 재사용)
    if (!workspaceDirCache.has(workspaceId)) {
      workspaceDirCache.set(workspaceId, workspaceDir);
    }
  }

  const absolute = path.join(wikiRoot(), workspaceDir, stripped);
  return readUtf8(absolute);
}
