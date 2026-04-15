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
import { canViewSensitivity } from "./wiki-sensitivity.js";

/**
 * apps/web/lib/server/wiki-graph-loader.ts
 *
 * Phase-W2 T5 — wiki_page_index + wiki_page_link 기반 GraphData 로더.
 *
 * - 노드: 워크스페이스의 publishedStatus='published' 위키 페이지.
 *   sensitivity 는 호출자 세션 기준으로 `canViewSensitivity` 필터.
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
  /** 권한 필터로 제외된 페이지 수 (디버깅용) */
  filteredOutCount: number;
  /** 전체 published 페이지 수 */
  totalPublishedCount: number;
}

export async function loadWikiGraphData(
  workspaceId: string,
  session: JarvisSession,
): Promise<WikiGraphData> {
  // 1) published 페이지 + 인바운드 카운트 (LEFT JOIN + GROUP BY)
  //    최신 updatedAt 순으로 상위 N개 (MAX_NODES). sensitivity 필터는 이후 in-memory.
  const pageRows = await db
    .select({
      id: wikiPageIndex.id,
      title: wikiPageIndex.title,
      slug: wikiPageIndex.slug,
      type: wikiPageIndex.type,
      sensitivity: wikiPageIndex.sensitivity,
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
      wikiPageIndex.sensitivity,
      wikiPageIndex.updatedAt,
    )
    .orderBy(desc(wikiPageIndex.updatedAt))
    .limit(MAX_NODES);

  const totalPublishedCount = pageRows.length;

  // 2) sensitivity 필터 (세션 기준)
  const visible = pageRows.filter((r) =>
    canViewSensitivity(session, r.sensitivity),
  );
  const filteredOutCount = totalPublishedCount - visible.length;

  if (visible.length === 0) {
    return {
      nodes: [],
      edges: [],
      filteredOutCount,
      totalPublishedCount,
    };
  }

  // 3) 인바운드 카운트 → node size 매핑 (log 스케일 근사)
  const maxInbound = visible.reduce(
    (acc, r) => Math.max(acc, Number(r.inboundCount ?? 0)),
    0,
  );

  const nodes: GraphNode[] = visible.map((r) => {
    const inbound = Number(r.inboundCount ?? 0);
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

  // 4) 엣지: kind='direct', toPageId 존재, 양끝이 visible 집합에 포함.
  const visibleIds = new Set(visible.map((r) => r.id));
  const pageIdList = Array.from(visibleIds);

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
        // DB 쪽에서도 한 번 걸러서 전송량 축소 (from/to 둘 다 검사는 in-memory).
        inArray(wikiPageLink.fromPageId, pageIdList),
      ),
    );

  const edges: GraphEdge[] = [];
  for (const e of edgeRows) {
    if (!e.toPageId) continue;
    if (!visibleIds.has(e.toPageId)) continue;
    edges.push({
      id: e.id,
      from: e.fromPageId,
      to: e.toPageId,
    });
  }

  return {
    nodes,
    edges,
    filteredOutCount,
    totalPublishedCount,
  };
}

export const WIKI_GRAPH_MAX_NODES = MAX_NODES;
