/**
 * dashboard-wiki-pick.ts — "오늘의 추천" 위키 페이지 1개 sampling.
 *
 * 결정론적 sampling: KST 날짜 + workspace_id seed로 동일한 페이지를
 * 같은 날 같은 사용자에게 노출. 페이지 풀은 dashboard-wiki와 같은
 * 권한·민감도 필터 통과 페이지.
 */

import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@jarvis/db/client";
import { wikiPageIndex } from "@jarvis/db/schema";
import { getAllowedWikiSensitivityValues } from "@jarvis/auth/rbac";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import type { DashboardWikiRow } from "./dashboard-wiki";

/** KST 날짜 + workspaceId hash. */
function pickSeed(workspaceId: string, now: Date): number {
  const ds = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now);
  const seedStr = `${ds}|${workspaceId}`;
  let h = 0;
  for (let i = 0; i < seedStr.length; i++) {
    h = (h * 31 + seedStr.charCodeAt(i)) >>> 0;
  }
  return h;
}

/**
 * 오늘의 추천 위키 페이지 1개. 풀 비면 null.
 *
 * 알고리즘: workspace + permission 필터 통과 페이지 N개 row 조회 →
 * deterministic seed로 1개 선택. row 수 < 1000건이면 메모리에 모두 들고
 * sampling. 그 이상 큰 워크스페이스가 되면 ORDER BY md5(id || seed) LIMIT 1로
 * 옮기는 게 좋다.
 */
export async function pickWikiOfTheDay(
  workspaceId: string,
  userPermissions: string[],
  now: Date,
  database: typeof db = db
): Promise<DashboardWikiRow | null> {
  const allowed = getAllowedWikiSensitivityValues(userPermissions);
  if (allowed.length === 0) return null;

  const requiredPermissionGate = userPermissions.includes(PERMISSIONS.ADMIN_ALL)
    ? sql`TRUE`
    : userPermissions.length > 0
      ? or(
          isNull(wikiPageIndex.requiredPermission),
          inArray(wikiPageIndex.requiredPermission, userPermissions)
        )
      : isNull(wikiPageIndex.requiredPermission);

  const rows = await database
    .select({
      id: wikiPageIndex.id,
      title: wikiPageIndex.title,
      path: wikiPageIndex.path,
      slug: wikiPageIndex.slug,
      createdAt: wikiPageIndex.createdAt,
      updatedAt: wikiPageIndex.updatedAt,
      sensitivity: wikiPageIndex.sensitivity
    })
    .from(wikiPageIndex)
    .where(
      and(
        eq(wikiPageIndex.workspaceId, workspaceId),
        eq(wikiPageIndex.publishedStatus, "published"),
        inArray(wikiPageIndex.sensitivity, allowed),
        requiredPermissionGate
      )
    )
    .limit(1000);

  if (rows.length === 0) return null;
  const seed = pickSeed(workspaceId, now);
  const idx = seed % rows.length;
  const row = rows[idx]!;
  return {
    ...row,
    tags: [],
    authorId: "",
    authorName: "—"
  };
}
