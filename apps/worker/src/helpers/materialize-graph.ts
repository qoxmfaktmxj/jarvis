// apps/worker/src/helpers/materialize-graph.ts

import { db } from '@jarvis/db/client';
import { graphNode, graphEdge, graphCommunity } from '@jarvis/db/schema/graph';

export interface GraphJsonNode {
  id: string;
  label: string;
  file_type?: string;
  source_file?: string;
  source_location?: string;
  community?: number;
}

export interface GraphJsonLink {
  source: string;
  target: string;
  relation: string;
  confidence: string;
  confidence_score?: number;
  _src?: string;
  _tgt?: string;
  weight?: number;
}

export interface GraphJson {
  nodes: GraphJsonNode[];
  links: GraphJsonLink[];
}

const BATCH_SIZE = 500;

/**
 * Bulk inserts graph.json data into graph_node, graph_edge, graph_community tables.
 */
export async function materializeGraph(
  snapshotId: string,
  graphJson: GraphJson,
): Promise<{ nodeCount: number; edgeCount: number; communityCount: number }> {
  // 1. Batch insert nodes
  for (let i = 0; i < graphJson.nodes.length; i += BATCH_SIZE) {
    const batch = graphJson.nodes.slice(i, i + BATCH_SIZE);
    await db.insert(graphNode).values(
      batch.map((n) => ({
        snapshotId,
        nodeId: n.id,
        label: n.label,
        fileType: n.file_type,
        sourceFile: n.source_file,
        sourceLocation: n.source_location,
        communityId: n.community,
      })),
    );
  }

  // 2. Batch insert edges
  for (let i = 0; i < graphJson.links.length; i += BATCH_SIZE) {
    const batch = graphJson.links.slice(i, i + BATCH_SIZE);
    await db.insert(graphEdge).values(
      batch.map((e) => ({
        snapshotId,
        sourceNodeId: e._src ?? e.source,
        targetNodeId: e._tgt ?? e.target,
        relation: e.relation,
        confidence: e.confidence,
        confidenceScore: e.confidence_score?.toString(),
        weight: e.weight?.toString(),
      })),
    );
  }

  // 3. Compute communities and insert
  const communityMap = new Map<number, GraphJsonNode[]>();
  for (const node of graphJson.nodes) {
    if (node.community == null) continue;
    if (!communityMap.has(node.community)) communityMap.set(node.community, []);
    communityMap.get(node.community)!.push(node);
  }

  const edgeCounts = new Map<string, number>();
  for (const link of graphJson.links) {
    const src = link._src ?? link.source;
    const tgt = link._tgt ?? link.target;
    edgeCounts.set(src, (edgeCounts.get(src) ?? 0) + 1);
    edgeCounts.set(tgt, (edgeCounts.get(tgt) ?? 0) + 1);
  }

  for (const [cid, nodes] of communityMap) {
    const topNodes = nodes
      .sort((a, b) => (edgeCounts.get(b.id) ?? 0) - (edgeCounts.get(a.id) ?? 0))
      .slice(0, 5)
      .map((n) => n.label);

    await db.insert(graphCommunity).values({
      snapshotId,
      communityId: cid,
      label: topNodes[0] ?? `Community ${cid}`,
      nodeCount: nodes.length,
      topNodes,
    });
  }

  return {
    nodeCount: graphJson.nodes.length,
    edgeCount: graphJson.links.length,
    communityCount: communityMap.size,
  };
}
