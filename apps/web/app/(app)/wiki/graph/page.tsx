// apps/web/app/(app)/wiki/graph/page.tsx

import { getTranslations } from 'next-intl/server';
import { requirePageSession } from '@/lib/server/page-auth';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { loadWikiGraphData } from '@/lib/server/wiki-graph-loader';
import { PageHeader } from '@/components/patterns/PageHeader';
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
      <div className="mx-auto max-w-6xl px-4 py-8">
        <PageHeader eyebrow="Wiki · Graph" title={t('title')} />
        <p className="text-sm text-destructive">{t('loadFailed')}</p>
      </div>
    );
  }

  if (loaded.nodes.length === 0) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8">
        <PageHeader eyebrow="Wiki · Graph" title={t('title')} />
        <p className="text-sm text-muted-foreground">
          {loaded.totalPublishedCount === 0
            ? t('emptyNoPages')
            : t('emptyAllFiltered')}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <PageHeader
        eyebrow="Wiki · Graph"
        title={t('title')}
        description={t('clickToNavigate')}
      />
      {loaded.filteredOutCount > 0 ? (
        <p className="-mt-4 mb-4 text-xs text-muted-foreground">
          {t('filteredHint', { count: loaded.filteredOutCount })}
        </p>
      ) : null}

      <GraphViewerPage data={{ nodes: loaded.nodes, edges: loaded.edges }} />
    </div>
  );
}
