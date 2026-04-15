// apps/web/app/(app)/wiki/graph/page.tsx

import { getTranslations } from 'next-intl/server';
import { requirePageSession } from '@/lib/server/page-auth';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { loadLatestGraphSnapshot } from '@/lib/server/graph-loader';
import { GraphViewerPage } from './_components/GraphViewerPage';
import type { GraphData, GraphEdge, GraphNode } from '@/components/GraphViewer/VisNetwork';

interface Props {
  searchParams: Promise<{ snapshotId?: string }>;
}

export const dynamic = 'force-dynamic';

function toGraphData(
  nodes: Array<{ nodeId: string; label: string; communityId: number | null; sourceFile: string | null }>,
  edges: Array<{ id: string; sourceNodeId: string; targetNodeId: string; relation: string; weight: string | null }>,
): GraphData {
  const visNodes: GraphNode[] = nodes.map((n) => ({
    id: n.nodeId,
    label: n.label,
    // graph_node.communityId 는 number | null. VisNetwork 의 group 은 string optional.
    ...(n.communityId !== null ? { group: String(n.communityId) } : {}),
    // pageSlug 는 sourceFile 을 대체 사용 (W3 에서 wiki_page_index 와 정합 추가 예정)
    ...(n.sourceFile ? { pageSlug: n.sourceFile } : {}),
  }));

  const visEdges: GraphEdge[] = edges.map((e) => {
    const weightNum = e.weight ? Number.parseFloat(e.weight) : NaN;
    return {
      id: e.id,
      from: e.sourceNodeId,
      to: e.targetNodeId,
      label: e.relation,
      ...(Number.isFinite(weightNum) ? { weight: weightNum } : {}),
    };
  });

  return { nodes: visNodes, edges: visEdges };
}

export default async function WikiGraphPage({ searchParams }: Props) {
  const session = await requirePageSession(PERMISSIONS.GRAPH_READ, '/dashboard');
  const t = await getTranslations('WikiGraph');
  const { snapshotId } = await searchParams;

  let loaded: Awaited<ReturnType<typeof loadLatestGraphSnapshot>>;
  try {
    loaded = await loadLatestGraphSnapshot(session.workspaceId, snapshotId);
  } catch (err) {
    console.error('[wiki/graph] loadLatestGraphSnapshot failed:', err);
    return (
      <div className="max-w-6xl mx-auto py-8 px-4 space-y-6">
        <h1 className="text-3xl font-bold">{t('title')}</h1>
        <p className="text-sm text-red-600">{t('loadFailed')}</p>
      </div>
    );
  }

  if (!loaded) {
    return (
      <div className="max-w-6xl mx-auto py-8 px-4 space-y-6">
        <h1 className="text-3xl font-bold">{t('title')}</h1>
        <p className="text-sm text-gray-500">{t('empty')}</p>
      </div>
    );
  }

  const data = toGraphData(loaded.nodes, loaded.edges);

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t('title')}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          snapshot: {loaded.snapshot.id}
        </p>
        <p className="text-sm text-gray-500 mt-2">{t('clickToNavigate')}</p>
      </div>

      <GraphViewerPage data={data} />
    </div>
  );
}
