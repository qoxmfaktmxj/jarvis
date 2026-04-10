// packages/ai/graph-context.ts

import { db } from '@jarvis/db/client';
import { graphSnapshot } from '@jarvis/db/schema/graph';
import { eq, and, sql } from 'drizzle-orm';

export interface RetrieveGraphContextOptions {
  explicitSnapshotId?: string;
  minMatchThreshold?: number;
}

export interface GraphNodeResult {
  nodeId: string;
  label: string;
  fileType: string | null;
  sourceFile: string | null;
  communityLabel: string | null;
  connections: { relation: string; targetLabel: string; confidence: string }[];
}

export interface GraphPath {
  from: string;
  to: string;
  hops: string[];
}

export interface GraphContext {
  snapshotId: string;
  snapshotTitle: string;
  matchedNodes: GraphNodeResult[];
  paths: GraphPath[];
  communityContext: string;
}

function extractKeywords(question: string): string[] {
  const stopwords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
    'could', 'should', 'may', 'might', 'can', 'shall',
    'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
    'and', 'or', 'but', 'not', 'this', 'that', 'it', 'what', 'how',
    'why', 'when', 'where', 'who', 'which',
    '이', '가', '은', '는', '을', '를', '에', '의', '로', '와', '과',
    '도', '만', '에서', '까지', '부터', '하고', '이나', '나',
  ]);

  return question
    .replace(/[^\w가-힣\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopwords.has(w.toLowerCase()))
    .map((w) => w.toLowerCase())
    .slice(0, 10);
}

export async function retrieveRelevantGraphContext(
  question: string,
  workspaceId: string,
  options: RetrieveGraphContextOptions = {},
): Promise<GraphContext | null> {
  // 1. Resolve the target snapshot.
  //    Explicit path: caller named a specific snapshotId — verify it exists,
  //    belongs to this workspace, and is in 'done' status.
  //    Otherwise: Task 3 will implement auto-pick. For now, return null.
  let snapshot: { id: string; title: string } | null = null;

  if (options.explicitSnapshotId) {
    const [row] = await db
      .select({ id: graphSnapshot.id, title: graphSnapshot.title })
      .from(graphSnapshot)
      .where(
        and(
          eq(graphSnapshot.id, options.explicitSnapshotId),
          eq(graphSnapshot.workspaceId, workspaceId),
          eq(graphSnapshot.buildStatus, 'done'),
        ),
      )
      .limit(1);
    if (!row) {
      console.warn(
        `[graph-context] explicit snapshotId=${options.explicitSnapshotId} not found or not accessible for workspace=${workspaceId}`,
      );
      return null;
    }
    snapshot = row;
  } else {
    // TASK 3에서 auto-pick 구현 — 현재는 placeholder
    snapshot = null;
  }

  if (!snapshot) return null;

  // 2. Extract keywords
  const keywords = extractKeywords(question);
  if (keywords.length === 0) return null;

  // 3. Match graph nodes via label ILIKE
  const likePatterns = keywords.map((k) => `%${k}%`);
  const matchedRows = await db.execute<{
    node_id: string;
    label: string;
    file_type: string | null;
    source_file: string | null;
    community_id: number | null;
    community_label: string | null;
  }>(sql`
    SELECT
      gn.node_id, gn.label, gn.file_type, gn.source_file,
      gn.community_id,
      gc.label AS community_label
    FROM graph_node gn
    LEFT JOIN graph_community gc
      ON gc.snapshot_id = gn.snapshot_id AND gc.community_id = gn.community_id
    WHERE gn.snapshot_id = ${snapshot.id}::uuid
      AND gn.label ILIKE ANY(${likePatterns}::text[])
    LIMIT 10
  `);

  if (matchedRows.rows.length === 0) return null;

  // 4. Get 1-hop neighbors
  const nodeIds = matchedRows.rows.map((r) => r.node_id);
  const neighborRows = await db.execute<{
    source_node_id: string;
    target_node_id: string;
    relation: string;
    confidence: string;
    source_label: string;
    target_label: string;
  }>(sql`
    SELECT
      ge.source_node_id, ge.target_node_id, ge.relation, ge.confidence,
      gn_src.label AS source_label, gn_tgt.label AS target_label
    FROM graph_edge ge
    JOIN graph_node gn_src
      ON gn_src.snapshot_id = ge.snapshot_id AND gn_src.node_id = ge.source_node_id
    JOIN graph_node gn_tgt
      ON gn_tgt.snapshot_id = ge.snapshot_id AND gn_tgt.node_id = ge.target_node_id
    WHERE ge.snapshot_id = ${snapshot.id}::uuid
      AND (ge.source_node_id = ANY(${nodeIds}::text[]) OR ge.target_node_id = ANY(${nodeIds}::text[]))
    LIMIT 50
  `);

  // Build connections per matched node
  const matchedNodes: GraphNodeResult[] = matchedRows.rows.map((row) => {
    const connections = neighborRows.rows
      .filter((e) => e.source_node_id === row.node_id || e.target_node_id === row.node_id)
      .map((e) => ({
        relation: e.relation,
        targetLabel:
          e.source_node_id === row.node_id ? e.target_label : e.source_label,
        confidence: e.confidence,
      }));

    return {
      nodeId: row.node_id,
      label: row.label,
      fileType: row.file_type,
      sourceFile: row.source_file,
      communityLabel: row.community_label,
      connections,
    };
  });

  // 5. Shortest path CTE (first two matched nodes if 2+)
  const paths: GraphPath[] = [];
  if (matchedRows.rows.length >= 2) {
    const fromId = matchedRows.rows[0]!.node_id;
    const toId = matchedRows.rows[1]!.node_id;

    // Depth limit 5: prevents runaway queries on dense graphs.
    // A 5-hop path covers most architectural relationships (caller → module → service → API → consumer).
    // Reduce to 3 if query latency is too high on graphs with >10k edges.
    const pathRows = await db.execute<{ path: string[]; depth: number }>(sql`
      WITH RECURSIVE path_search AS (
        SELECT
          source_node_id AS current_node,
          target_node_id AS next_node,
          ARRAY[source_node_id] AS visited,
          1 AS depth
        FROM graph_edge
        WHERE snapshot_id = ${snapshot.id}::uuid
          AND source_node_id = ${fromId}

        UNION ALL

        SELECT
          ps.next_node,
          ge.target_node_id,
          ps.visited || ps.next_node,
          ps.depth + 1
        FROM path_search ps
        JOIN graph_edge ge
          ON ge.snapshot_id = ${snapshot.id}::uuid
          AND ge.source_node_id = ps.next_node
        WHERE ps.depth < 5
          AND NOT ps.next_node = ANY(ps.visited)
      )
      SELECT visited || next_node AS path, depth
      FROM path_search
      WHERE next_node = ${toId}
      ORDER BY depth ASC
      LIMIT 1
    `);

    if (pathRows.rows.length > 0) {
      const pathNodeIds = pathRows.rows[0]!.path;
      const labelRows = await db.execute<{ node_id: string; label: string }>(sql`
        SELECT node_id, label FROM graph_node
        WHERE snapshot_id = ${snapshot.id}::uuid
          AND node_id = ANY(${pathNodeIds}::text[])
      `);
      const labelMap = new Map(labelRows.rows.map((r) => [r.node_id, r.label]));

      paths.push({
        from: labelMap.get(pathNodeIds[0]!) ?? pathNodeIds[0]!,
        to: labelMap.get(pathNodeIds[pathNodeIds.length - 1]!) ?? pathNodeIds[pathNodeIds.length - 1]!,
        hops: pathNodeIds.map((id) => labelMap.get(id) ?? id),
      });
    }
  }

  // 6. Community context
  const communityIds = [
    ...new Set(
      matchedRows.rows
        .map((r) => r.community_id)
        .filter((c): c is number => c != null),
    ),
  ];
  let communityContext = '';
  if (communityIds.length > 0) {
    const commRows = await db.execute<{
      community_id: number;
      label: string;
      node_count: number;
      top_nodes: string[];
    }>(sql`
      SELECT community_id, label, node_count, top_nodes
      FROM graph_community
      WHERE snapshot_id = ${snapshot.id}::uuid
        AND community_id = ANY(${communityIds}::int[])
    `);
    communityContext = commRows.rows
      .map(
        (c) =>
          `Community "${c.label}" (${c.node_count} nodes): ${(c.top_nodes ?? []).join(', ')}`,
      )
      .join('\n');
  }

  return {
    snapshotId: snapshot.id,
    snapshotTitle: snapshot.title,
    matchedNodes,
    paths,
    communityContext,
  };
}

export function formatGraphContextXml(ctx: GraphContext): string {
  const nodesXml = ctx.matchedNodes
    .map((n) => {
      const conns = n.connections
        .slice(0, 5)
        .map(
          (c) =>
            `      <connection relation="${c.relation}" target="${c.targetLabel}" confidence="${c.confidence}" />`,
        )
        .join('\n');
      return `    <node label="${n.label}" type="${n.fileType ?? 'unknown'}" file="${n.sourceFile ?? ''}" community="${n.communityLabel ?? ''}">
${conns}
    </node>`;
    })
    .join('\n');

  const pathsXml = ctx.paths
    .map(
      (p) =>
        `    <path from="${p.from}" to="${p.to}">\n      ${p.hops.join(' --> ')}\n    </path>`,
    )
    .join('\n');

  return `<graph_context>
  <matched_nodes>
${nodesXml}
  </matched_nodes>
  <paths>
${pathsXml}
  </paths>
  <community_context>
    ${ctx.communityContext}
  </community_context>
</graph_context>`;
}
