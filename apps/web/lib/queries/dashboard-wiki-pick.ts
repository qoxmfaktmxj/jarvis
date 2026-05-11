/**
 * dashboard-wiki-pick.ts — "오늘의 추천" 위키 페이지 1개 sampling.
 *
 * 결정론적 sampling: KST 날짜 + workspace_id seed로 동일한 페이지를
 * 같은 날 같은 사용자에게 노출.
 */

import { and, eq } from "drizzle-orm";
import { db } from "@jarvis/db/client";
import { wikiPageIndex } from "@jarvis/db/schema";
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
 * 알고리즘: workspace 필터 통과 페이지 N개 row 조회 → deterministic seed로
 * 1개 선택. row 수 < 1000건이면 메모리에 모두 들고 sampling. 그 이상 큰
 * 워크스페이스가 되면 ORDER BY md5(id || seed) LIMIT 1로 옮기는 게 좋다.
 */
export async function pickWikiOfTheDay(
  workspaceId: string,
  _userPermissions: string[],
  now: Date,
  database: typeof db = db
): Promise<DashboardWikiRow | null> {
  const rows = await database
    .select({
      id: wikiPageIndex.id,
      title: wikiPageIndex.title,
      path: wikiPageIndex.path,
      slug: wikiPageIndex.slug,
      createdAt: wikiPageIndex.createdAt,
      updatedAt: wikiPageIndex.updatedAt
    })
    .from(wikiPageIndex)
    .where(
      and(
        eq(wikiPageIndex.workspaceId, workspaceId),
        eq(wikiPageIndex.publishedStatus, "published")
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
