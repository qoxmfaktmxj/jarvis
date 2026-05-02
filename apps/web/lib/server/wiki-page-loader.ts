import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "@jarvis/db/client";
import { wikiPageIndex, type WikiPageIndex } from "@jarvis/db/schema/wiki-page-index";
import {
  readUtf8,
  parseFrontmatter,
  type WikiFrontmatter,
} from "@jarvis/wiki-fs";
import { resolveWikiPath } from "./repo-root.js";
import { resolveAllowedWikiSensitivities } from "@jarvis/auth/rbac";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";

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
 * Security (P2 fix): sensitivity + requiredPermission 필터를 DB WHERE 절로
 * 이동했다. 미허가 행은 아예 반환되지 않으므로 존재 여부조차 노출되지 않는다.
 * 디스크 read 는 DB 행이 반환된(= 접근 허가된) 뒤에만 실행된다.
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
 * Accepting a narrow interface avoids a hard dependency on the full JarvisSession type
 * while still allowing any JarvisSession to be passed.
 */
export interface WikiPageViewerSession {
  permissions: readonly string[];
}

/**
 * Load a published wiki page that the given viewer is allowed to see.
 *
 * Permission filtering is applied inside the DB WHERE clause so that
 * unauthorized rows are never returned (and no disk I/O occurs for them).
 * Callers receive `null` for both "not found" and "access denied" — they
 * should respond with 404 in both cases to avoid leaking page existence.
 *
 * @param workspaceId  Target workspace UUID.
 * @param routeKeyOrSlug  URL routeKey or legacy slug.
 * @param viewer  Session of the requesting user (permissions used for ACL filter).
 *                Pass `null` only from trusted internal callers that have already
 *                verified access independently (e.g. server-side page.tsx that calls
 *                `forbidden()` before reaching this function).
 */
export async function loadWikiPageForView(
  workspaceId: string,
  routeKeyOrSlug: string,
  viewer: WikiPageViewerSession | null = null,
): Promise<LoadedWikiPage | null> {
  // Build the allowed sensitivity list for this viewer.
  // null viewer = trusted internal caller — skip sensitivity filter (uses empty
  // array guard below which skips the inArray clause).
  const allowedSensitivities: string[] | null = viewer
    ? resolveAllowedWikiSensitivities(viewer.permissions as string[])
    : null;

  // If the viewer has no permitted sensitivity values at all, deny immediately
  // without touching the DB (same result as "AND 1=0", but cheaper).
  if (allowedSensitivities !== null && allowedSensitivities.length === 0) {
    return null;
  }

  // requiredPermission DB filter — admins (ADMIN_ALL) and trusted internal
  // callers (viewer === null) bypass it; everyone else must either match the
  // page's requiredPermission or get only rows where it's NULL/empty.
  const isAdmin = viewer !== null && viewer.permissions.includes(PERMISSIONS.ADMIN_ALL);
  const applyRequiredPermissionFilter = viewer !== null && !isAdmin;
  const viewerPermissions = viewer?.permissions ?? [];

  /**
   * Build the WHERE conditions common to both routeKey and slug lookups.
   * Includes:
   *   - workspaceId
   *   - publishedStatus = 'published'
   *   - sensitivity IN (...) — only when viewer is provided
   *   - requiredPermission IS NULL OR '' OR IN (viewer.permissions)
   *     — only for non-admin authenticated viewers (admin and internal-null skip)
   */
  function buildConditions(keyColumn: typeof wikiPageIndex.routeKey | typeof wikiPageIndex.slug) {
    const base = [
      eq(wikiPageIndex.workspaceId, workspaceId),
      eq(keyColumn, routeKeyOrSlug),
      eq(wikiPageIndex.publishedStatus, "published"),
    ] as ReturnType<typeof eq>[];

    if (allowedSensitivities !== null) {
      base.push(inArray(wikiPageIndex.sensitivity, allowedSensitivities));
    }

    if (applyRequiredPermissionFilter) {
      // Drizzle's `inArray(col, [])` compiles to a falsey predicate, so we
      // OR with isNull/empty-string to keep no-permission-required pages
      // visible even when the viewer has zero permissions.
      const permissionConds = [
        isNull(wikiPageIndex.requiredPermission),
        eq(wikiPageIndex.requiredPermission, ""),
      ] as ReturnType<typeof eq>[];
      if (viewerPermissions.length > 0) {
        permissionConds.push(
          inArray(wikiPageIndex.requiredPermission, viewerPermissions as string[]),
        );
      }
      base.push(or(...permissionConds) as ReturnType<typeof eq>);
    }

    return and(...base);
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
    console.warn('[wiki-page-loader] no DB match (or access denied)', { workspaceId, routeKeyOrSlug });
    return null;
  }

  // requiredPermission is now part of the DB WHERE clause above; this
  // belt-and-suspenders re-check stays here so that a future query change
  // can't silently leak permission-gated pages.
  if (
    viewer !== null &&
    meta.requiredPermission &&
    !viewer.permissions.includes(PERMISSIONS.ADMIN_ALL) &&
    !viewer.permissions.includes(meta.requiredPermission)
  ) {
    console.warn('[wiki-page-loader] requiredPermission denied (post-DB recheck)', { workspaceId, routeKeyOrSlug });
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

  const { data: frontmatter, body } = parseFrontmatter(content);

  return {
    meta,
    content,
    bodyOnly: body,
    frontmatter,
  };
}
