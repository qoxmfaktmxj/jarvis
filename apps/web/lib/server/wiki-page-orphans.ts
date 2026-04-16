import { and, eq, isNull } from "drizzle-orm";
import { db } from "@jarvis/db/client";
import { wikiPageLink } from "@jarvis/db/schema/wiki-page-link";

/**
 * apps/web/lib/server/wiki-page-orphans.ts
 *
 * T6 — 현재 wiki 페이지에서 출발하는 wikilink 중 target 이 없는(orphan) 링크를
 *      조회해 UI 에서 시각적으로 구분(빨간 링크) 할 수 있도록 한다.
 *
 * SSoT 는 `wiki_page_link` 테이블이다. ingest/lint 파이프라인이 이미
 * `toPageId = NULL` 인 행을 orphan 으로 마킹해 두었으므로 viewer 는 이를 읽기만 한다.
 *
 * 반환: orphan 상태인 target slug(= toPath) 집합. 호출자는 Set 으로 변환해
 *       `WikiPageView` 의 `orphanSlugs` prop 으로 넘긴다.
 */
export async function loadOrphanOutboundSlugs(
  workspaceId: string,
  fromPageId: string,
): Promise<string[]> {
  const rows = await db
    .select({ toPath: wikiPageLink.toPath })
    .from(wikiPageLink)
    .where(
      and(
        eq(wikiPageLink.workspaceId, workspaceId),
        eq(wikiPageLink.fromPageId, fromPageId),
        eq(wikiPageLink.kind, "direct"),
        isNull(wikiPageLink.toPageId),
      ),
    );

  // toPath 는 nullable 이지만 orphan direct link 에서는 반드시 채워져 있음.
  // 혹시 NULL 이 섞이면 방어적으로 제거.
  const slugs = new Set<string>();
  for (const r of rows) {
    if (r.toPath) slugs.add(r.toPath);
  }
  return [...slugs];
}
