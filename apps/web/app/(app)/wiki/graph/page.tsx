// apps/web/app/(app)/wiki/graph/page.tsx

import { getTranslations } from 'next-intl/server';
import { requirePageSession } from '@/lib/server/page-auth';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { loadWikiGraphData } from '@/lib/server/wiki-graph-loader';
import { GraphViewerPage } from './_components/GraphViewerPage';

export const dynamic = 'force-dynamic';

/**
 * Phase-W2 T5 — wiki_page_index + wiki_page_link 기반 그래프 시각화.
 *
 * - 노드: published 위키 페이지 (sensitivity 세션 필터 + 상위 300개)
 * - 엣지: kind='direct', toPageId 존재, 양끝 노드가 visible 집합에 포함
 * - 빈 결과 → empty state 메시지.
 */
export default async function WikiGraphPage() {
  const session = await requirePageSession(PERMISSIONS.GRAPH_READ, '/dashboard');
  const t = await getTranslations('WikiGraph');

  let loaded: Awaited<ReturnType<typeof loadWikiGraphData>>;
  try {
    loaded = await loadWikiGraphData(session.workspaceId, session);
  } catch (err) {
    console.error('[wiki/graph] loadWikiGraphData failed:', err);
    return (
      <div className="max-w-6xl mx-auto py-8 px-4 space-y-6">
        <h1 className="text-3xl font-bold">{t('title')}</h1>
        <p className="text-sm text-red-600">{t('loadFailed')}</p>
      </div>
    );
  }

  if (loaded.nodes.length === 0) {
    return (
      <div className="max-w-6xl mx-auto py-8 px-4 space-y-6">
        <h1 className="text-3xl font-bold">{t('title')}</h1>
        <p className="text-sm text-gray-500">
          {loaded.totalPublishedCount === 0
            ? t('emptyNoPages')
            : t('emptyAllFiltered')}
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t('title')}</h1>
        <p className="text-sm text-gray-500 mt-2">{t('clickToNavigate')}</p>
        {loaded.filteredOutCount > 0 ? (
          <p className="text-xs text-muted-foreground mt-1">
            {t('filteredHint', { count: loaded.filteredOutCount })}
          </p>
        ) : null}
      </div>

      <GraphViewerPage data={{ nodes: loaded.nodes, edges: loaded.edges }} />
    </div>
  );
}
