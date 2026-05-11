import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@jarvis/db/client";
import { wikiPageIndex } from "@jarvis/db/schema/wiki-page-index";
import { wikiPageLink } from "@jarvis/db/schema/wiki-page-link";
import type { JarvisSession } from "@jarvis/auth/types";
import type {
  GraphData,
  GraphEdge,
  GraphNode,
} from "@/components/GraphViewer/VisNetwork";

/**
 * apps/web/lib/server/wiki-graph-loader.ts
 *
 * Phase-W2 T5 — wiki_page_index + wiki_page_link 기반 GraphData 로더.
 *
 * - 노드: 워크스페이스의 publishedStatus='published' 위키 페이지.
 *   2026-05-11: sensitivity 컬럼 제거 (D1=B). RBAC + workspaceId 만으로 격리.
 *   인바운드 링크 수(`inboundCount`)에 비례해 `size` 조정 (hub 가중치).
 *   최신성(updatedAt) 기준으로 상위 `MAX_NODES` 개만 반환.
 * - 엣지: kind='direct' + toPageId IS NOT NULL. 필터된 노드 집합 내부의 엣지만.
 * - 빈 결과는 `{ nodes: [], edges: [] }` 반환 (empty state 처리는 page.tsx 책임).
 */

const MAX_NODES = 300;
/** 인바운드 링크 수에 따른 노드 크기 하한 / 상한 */
const SIZE_MIN = 12;
const SIZE_MAX = 48;

export interface WikiGraphData extends GraphData {
  /**
   * @deprecated 2026-05-11 sensitivity 제거 후 항상 0. 호출처 호환을 위해 유지.
   */
  filteredOutCount: number;
  /** 전체 published 페이지 수 */
  totalPublishedCount: number;
}

export async function loadWikiGraphData(
  workspaceId: string,
  _session: JarvisSession,
): Promise<WikiGraphData> {
  // 전체 published 페이지 수 (디버깅용).
  const [totalRow] = await db
    .select({
      count: sql<number>`COUNT(*)::int`,
    })
    .from(wikiPageIndex)
    .where(
      and(
        eq(wikiPageIndex.workspaceId, workspaceId),
        eq(wikiPageIndex.publishedStatus, "published"),
      ),
    );
  const totalPublishedCount = Number(totalRow?.count ?? 0);

  // 1) published 페이지 + 인바운드 카운트 (LEFT JOIN + GROUP BY)
  const pageRows = await db
    .select({
      id: wikiPageIndex.id,
      title: wikiPageIndex.title,
      slug: wikiPageIndex.slug,
      type: wikiPageIndex.type,
      updatedAt: wikiPageIndex.updatedAt,
      inboundCount: sql<number>`COUNT(${wikiPageLink.id})::int`,
    })
    .from(wikiPageIndex)
    .leftJoin(
      wikiPageLink,
      and(
        eq(wikiPageLink.toPageId, wikiPageIndex.id),
        eq(wikiPageLink.workspaceId, workspaceId),
        eq(wikiPageLink.kind, "direct"),
      ),
    )
    .where(
      and(
        eq(wikiPageIndex.workspaceId, workspaceId),
        eq(wikiPageIndex.publishedStatus, "published"),
      ),
    )
    .groupBy(
      wikiPageIndex.id,
      wikiPageIndex.title,
      wikiPageIndex.slug,
      wikiPageIndex.type,
      wikiPageIndex.updatedAt,
    )
    .orderBy(desc(wikiPageIndex.updatedAt))
    .limit(MAX_NODES);

  const visible = pageRows;
  const filteredOutCount = 0;

  if (visible.length === 0) {
    return {
      nodes: [],
      edges: [],
      filteredOutCount,
      totalPublishedCount,
    };
  }

  // 2) 엣지: kind='direct', toPageId 존재, 양끝이 visible 집합에 포함.
  const visibleIds = new Set(visible.map((r) => r.id));
  const pageIdList = Array.from(visibleIds);

  if (pageIdList.length === 0) {
    return {
      nodes: [],
      edges: [],
      filteredOutCount,
      totalPublishedCount,
    };
  }

  const edgeRows = await db
    .select({
      id: wikiPageLink.id,
      fromPageId: wikiPageLink.fromPageId,
      toPageId: wikiPageLink.toPageId,
    })
    .from(wikiPageLink)
    .where(
      and(
        eq(wikiPageLink.workspaceId, workspaceId),
        eq(wikiPageLink.kind, "direct"),
        isNotNull(wikiPageLink.toPageId),
        inArray(wikiPageLink.fromPageId, pageIdList),
        inArray(wikiPageLink.toPageId, pageIdList),
      ),
    );

  const edges: GraphEdge[] = [];
  const visibleInboundCount = new Map<string, number>();
  for (const e of edgeRows) {
    if (!e.toPageId) continue;
    if (!visibleIds.has(e.toPageId)) continue;
    if (!visibleIds.has(e.fromPageId)) continue;
    edges.push({
      id: e.id,
      from: e.fromPageId,
      to: e.toPageId,
    });
    visibleInboundCount.set(
      e.toPageId,
      (visibleInboundCount.get(e.toPageId) ?? 0) + 1,
    );
  }

  // 3) 인바운드 카운트(가시 엣지 기준) → node size 매핑.
  const maxInbound = visible.reduce(
    (acc, r) => Math.max(acc, visibleInboundCount.get(r.id) ?? 0),
    0,
  );

  const nodes: GraphNode[] = visible.map((r) => {
    const inbound = visibleInboundCount.get(r.id) ?? 0;
    const size =
      maxInbound > 0
        ? SIZE_MIN + ((SIZE_MAX - SIZE_MIN) * inbound) / maxInbound
        : SIZE_MIN;
    return {
      id: r.id,
      label: r.title,
      group: r.type,
      pageSlug: r.slug,
      size: Math.round(size),
    };
  });

  return {
    nodes,
    edges,
    filteredOutCount,
    totalPublishedCount,
  };
}

export const WIKI_GRAPH_MAX_NODES = MAX_NODES;
