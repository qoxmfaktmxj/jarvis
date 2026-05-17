import { and, eq } from "drizzle-orm";
import { db } from "@jarvis/db/client";
import { wikiPageIndex, type WikiPageIndex } from "@jarvis/db/schema/wiki-page-index";
import {
  readUtf8,
  parseFrontmatter,
  defaultFrontmatter,
  splitFrontmatter,
  type WikiFrontmatter,
} from "@jarvis/wiki-fs";
import { resolveWikiPath } from "./repo-root";

/**
 * apps/web/lib/server/wiki-page-loader.ts
 *
 * Phase-W2 C2 — wiki page 본문 로드.
 *
 * - SSoT 는 디스크. wikiPageIndex 는 색인/메타 전용.
 * - body 는 wikiPageIndex.path 를 통해 repo-root 기준으로 readUtf8.
 * - frontmatter / body 분리는 @jarvis/wiki-fs 의 parseFrontmatter 사용.
 * - publishedStatus='published' 필터 — draft/archived 는 뷰어 페이지에서 숨김.
 *
 * 접근 제어: RBAC + workspaceId 단일 모델 (sensitivity/requiredPermission 격리는
 * 2026-05-11 sensitivity 제거 step 2A 에서 일괄 폐기).
 *
 * routeKey-first lookup: URL segments 를 합친 routeKey 로 먼저 조회하고,
 * 없으면 slug fallback (하위 호환).
 */
export interface LoadedWikiPage {
  meta: WikiPageIndex;
  /** 디스크에서 읽은 원본 markdown (frontmatter + body) */
  content: string;
  /** frontmatter 를 제외한 본문 markdown */
  bodyOnly: string;
  /** 파싱된 frontmatter (디스크 SSoT 기준) */
  frontmatter: WikiFrontmatter;
}

/**
 * Minimal session shape required by this loader.
 * Kept as an interface for backward compatibility with existing callers — the
 * `viewer` argument is no longer used for sensitivity/permission gating.
 */
export interface WikiPageViewerSession {
  permissions: readonly string[];
}

/**
 * Load a published wiki page.
 *
 * The viewer argument is accepted for backward compatibility but no longer
 * influences row visibility — RBAC is now enforced by route-level
 * `requirePermission(KNOWLEDGE_READ)` checks plus workspace scoping.
 *
 * @param workspaceId  Target workspace UUID.
 * @param routeKeyOrSlug  URL routeKey or legacy slug.
 * @param _viewer  Unused (kept for backward compat with existing callers).
 */
export async function loadWikiPageForView(
  workspaceId: string,
  routeKeyOrSlug: string,
  _viewer: WikiPageViewerSession | null = null,
): Promise<LoadedWikiPage | null> {
  function buildConditions(keyColumn: typeof wikiPageIndex.routeKey | typeof wikiPageIndex.slug) {
    return and(
      eq(wikiPageIndex.workspaceId, workspaceId),
      eq(keyColumn, routeKeyOrSlug),
      eq(wikiPageIndex.publishedStatus, "published"),
    );
  }

  // 1) Try routeKey first (path-based, unique within workspace).
  const rowsByRouteKey = await db
    .select()
    .from(wikiPageIndex)
    .where(buildConditions(wikiPageIndex.routeKey))
    .limit(1);

  // 2) Fallback to slug (leaf filename, backward compat).
  const rows = rowsByRouteKey.length > 0
    ? rowsByRouteKey
    : await db
        .select()
        .from(wikiPageIndex)
        .where(buildConditions(wikiPageIndex.slug))
        .limit(1);

  const meta = rows[0];
  if (!meta) {
    console.warn('[wiki-page-loader] no DB match', { workspaceId, routeKeyOrSlug });
    return null;
  }

  // Only read the disk file after access has been confirmed.
  let content: string;
  try {
    content = await readUtf8(resolveWikiPath(meta.path));
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      // 파일이 없음 — projection drift로 간주하고 null 반환.
      // silent swallow 가 아니라 운영 관찰성을 위해 warn 으로 남긴다.
      console.warn(
        "[wiki-page-loader] projection drift: file missing for",
        { workspaceId, routeKeyOrSlug, path: meta.path },
      );
      return null;
    }
    // EACCES, EIO 등 디스크/권한 오류는 500으로 전파
    console.error("[wiki-page-loader] disk read failed:", err);
    throw err;
  }

  // Defense-in-depth: even though parseFrontmatter no longer throws on enum
  // mismatches (2026-05-17 cleanup), keep a try/catch here so any future YAML
  // surprises render as an empty-frontmatter page rather than a 500. The body
  // is still returned via splitFrontmatter so the user sees the page content.
  let frontmatter: WikiFrontmatter;
  let body: string;
  try {
    ({ data: frontmatter, body } = parseFrontmatter(content));
  } catch (err) {
    console.warn(
      "[wiki-page-loader] frontmatter parse failed; serving body with defaults",
      { workspaceId, routeKeyOrSlug, path: meta.path, error: (err as Error).message },
    );
    frontmatter = defaultFrontmatter();
    body = splitFrontmatter(content).body;
  }

  return {
    meta,
    content,
    bodyOnly: body,
    frontmatter,
  };
}
