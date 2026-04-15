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
import {
  canViewSensitivity,
  type DbSensitivity,
} from "./wiki-sensitivity.js";

/**
 * 세션 권한 매트릭스를 역방향으로 읽어 허용 sensitivity 목록을 계산.
 * `canViewSensitivity` 규칙과 반드시 일치해야 함.
 */
function allowedSensitivitiesForSession(
  session: JarvisSession,
): DbSensitivity[] {
  const candidates: DbSensitivity[] = [
    "PUBLIC",
    "INTERNAL",
    "RESTRICTED",
    "SECRET_REF_ONLY",
  ];
  return candidates.filter((s) => canViewSensitivity(session, s));
}

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
  // 0) 세션 권한 기반 허용 sensitivity 목록 선계산.
  //    권한이 전혀 없으면(KNOWLEDGE_READ 없음) 빈 결과로 즉시 반환.
  const allowedSensitivities = allowedSensitivitiesForSession(session);

  // 전체 published 페이지 수(권한과 무관)는 디버깅용으로 별도 집계.
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

  if (allowedSensitivities.length === 0) {
    return {
      nodes: [],
      edges: [],
      filteredOutCount: totalPublishedCount,
      totalPublishedCount,
    };
  }

  // 1) published + sensitivity 허용 페이지 + 인바운드 카운트 (LEFT JOIN + GROUP BY)
  //    sensitivity 필터를 DB WHERE 에 포함해 MAX_NODES 가 가시 노드 기준으로 동작.
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
        inArray(wikiPageIndex.sensitivity, allowedSensitivities),
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

  // 2) sensitivity 는 이미 DB 에서 걸렀지만, 방어적으로 한 번 더 확인.
  const visible = pageRows.filter((r) =>
    canViewSensitivity(session, r.sensitivity),
  );
  const filteredOutCount = Math.max(0, totalPublishedCount - visible.length);

  if (visible.length === 0) {
    return {
      nodes: [],
      edges: [],
      filteredOutCount,
      totalPublishedCount,
    };
  }

  // 3) 엣지: kind='direct', toPageId 존재, 양끝이 visible 집합에 포함.
  const visibleIds = new Set(visible.map((r) => r.id));
  const pageIdList = Array.from(visibleIds);

  // 가드: 가시 노드가 없으면 엣지 쿼리 자체를 생략.
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
        // DB 쪽에서 양끝 모두 visible 집합으로 제한 (전송량 축소 + 정확성).
        inArray(wikiPageLink.fromPageId, pageIdList),
        inArray(wikiPageLink.toPageId, pageIdList),
      ),
    );

  const edges: GraphEdge[] = [];
  // visible 엣지 기준으로 inbound 수 재집계.
  const visibleInboundCount = new Map<string, number>();
  for (const e of edgeRows) {
    if (!e.toPageId) continue;
    // 양끝 visible 여부는 DB 에서 걸렀지만 방어적 재확인.
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

  // 4) 인바운드 카운트(가시 엣지 기준) → node size 매핑.
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
