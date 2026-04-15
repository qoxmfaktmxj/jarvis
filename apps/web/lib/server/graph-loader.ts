import { and, desc, eq } from "drizzle-orm";
import { db } from "@jarvis/db/client";
import {
  graphSnapshot,
  graphNode,
  graphEdge,
} from "@jarvis/db/schema/graph";

/**
 * apps/web/lib/server/graph-loader.ts
 *
 * Phase-W2 C3 — workspace 의 최신 graph snapshot + nodes + edges 로드.
 *
 * - snapshotId 지정 시 그대로 사용.
 * - 미지정 시 buildStatus='done' 인 가장 최근 스냅샷.
 * - GraphData 매핑은 호출자(page.tsx) 에서 수행 (UI 의 VisNetwork 형식과 결합도 분리).
 */
export type GraphSnapshotRow = typeof graphSnapshot.$inferSelect;
export type GraphNodeRow = typeof graphNode.$inferSelect;
export type GraphEdgeRow = typeof graphEdge.$inferSelect;

export interface LoadedGraphSnapshot {
  snapshot: GraphSnapshotRow;
  nodes: GraphNodeRow[];
  edges: GraphEdgeRow[];
}

export async function loadLatestGraphSnapshot(
  workspaceId: string,
  snapshotId?: string,
): Promise<LoadedGraphSnapshot | null> {
  let snapshot: GraphSnapshotRow | undefined;

  if (snapshotId) {
    const rows = await db
      .select()
      .from(graphSnapshot)
      .where(
        and(
          eq(graphSnapshot.id, snapshotId),
          eq(graphSnapshot.workspaceId, workspaceId),
        ),
      )
      .limit(1);
    snapshot = rows[0];
  } else {
    const rows = await db
      .select()
      .from(graphSnapshot)
      .where(
        and(
          eq(graphSnapshot.workspaceId, workspaceId),
          eq(graphSnapshot.buildStatus, "done"),
        ),
      )
      .orderBy(desc(graphSnapshot.createdAt))
      .limit(1);
    snapshot = rows[0];
  }

  if (!snapshot) return null;

  const [nodes, edges] = await Promise.all([
    db.select().from(graphNode).where(eq(graphNode.snapshotId, snapshot.id)),
    db.select().from(graphEdge).where(eq(graphEdge.snapshotId, snapshot.id)),
  ]);

  return { snapshot, nodes, edges };
}
