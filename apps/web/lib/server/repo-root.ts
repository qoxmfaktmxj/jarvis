import * as path from "node:path";

/**
 * apps/web/lib/server/repo-root.ts
 *
 * Phase-W2 — wiki/{workspaceId}/**.md 디스크 경로 해석 헬퍼.
 *
 * - SSoT: `wiki/{workspaceId}/**.md` 파일들. wikiPageIndex.path 는 repo-root 기준 상대 경로.
 * - dev: process.cwd() 가 보통 monorepo 루트 — fallback으로 충분.
 * - prod: WIKI_REPO_ROOT env 필수. README/배포 매뉴얼에 명시.
 *
 * worker(`wiki-bootstrap.ts`)는 __dirname 기반으로 REPO_ROOT 를 잡지만,
 * web 서버는 `next start` 가 monorepo 루트에서 실행되거나 apps/web 에서 실행될 수 있으므로
 * env 우선 + cwd fallback 으로 일관성을 잡는다.
 */
export function getWikiRepoRoot(): string {
  const fromEnv = process.env["WIKI_REPO_ROOT"];
  if (fromEnv && fromEnv.trim().length > 0) {
    return path.resolve(fromEnv);
  }
  return path.resolve(process.cwd());
}

/**
 * wikiPageIndex.path 는 항상 `wiki/{workspaceId}/...` 형태의 repo-relative 경로여야 한다.
 * 절대 경로 기준 호환을 위해 path.join 으로 결합.
 */
export function resolveWikiPath(repoRelativePath: string): string {
  return path.join(getWikiRepoRoot(), repoRelativePath);
}
