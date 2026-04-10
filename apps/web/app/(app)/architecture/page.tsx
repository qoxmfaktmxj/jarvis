// apps/web/app/(app)/architecture/page.tsx

import { getTranslations } from 'next-intl/server';
import { requirePageSession } from '@/lib/server/page-auth';
import { canAccessGraphSnapshotSensitivity } from '@jarvis/auth/rbac';
import { db } from '@jarvis/db/client';
import { graphSnapshot } from '@jarvis/db/schema/graph';
import { eq, desc, and } from 'drizzle-orm';
import { GraphViewer } from './components/GraphViewer';
import { SnapshotSelector } from './components/SnapshotSelector';
import { GodNodesCard } from './components/GodNodesCard';
import { SuggestedQuestions } from './components/SuggestedQuestions';

interface Props {
  searchParams: Promise<{ snapshot?: string }>;
}

export default async function ArchitecturePage({ searchParams }: Props) {
  const t = await getTranslations('Architecture');
  const session = await requirePageSession('graph:read');
  const workspaceId = session.workspaceId;
  const { snapshot: selectedId } = await searchParams;

  // Fetch all successfully completed snapshots
  const snapshots = await db
    .select()
    .from(graphSnapshot)
    .where(
      and(
        eq(graphSnapshot.workspaceId, workspaceId),
        eq(graphSnapshot.buildStatus, 'done'),
      ),
    )
    .orderBy(desc(graphSnapshot.createdAt))
    .limit(20);

  const authorizedSnapshots = snapshots.filter((s) =>
    canAccessGraphSnapshotSensitivity(session.permissions, s.sensitivity),
  );

  const current = selectedId
    ? (authorizedSnapshots.find((s) => s.id === selectedId) ?? authorizedSnapshots[0])
    : authorizedSnapshots[0];

  if (!current) {
    return (
      <main className="p-6">
        <h1 className="text-2xl font-bold mb-4">{t('title')}</h1>
        <p className="text-gray-500">
          아직 Graphify 분석 결과가 없습니다. ZIP 파일을 업로드하거나 수동으로 빌드를 트리거하세요.
        </p>
      </main>
    );
  }

  // Serialize for Client Components (Date → string, pick only needed fields)
  const serializedSnapshots = authorizedSnapshots.map((s) => ({
    id: s.id,
    title: s.title,
    createdAt: s.createdAt.toISOString(),
    buildMode: s.buildMode,
  }));

  const metadata = (current.analysisMetadata ?? {}) as {
    godNodes?: string[];
    suggestedQuestions?: string[];
  };

  return (
    <main className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <SnapshotSelector snapshots={serializedSnapshots} currentId={current.id} />
      </div>

      {/* Graph Viewer — uses graph.html from MinIO */}
      {current.graphHtmlPath ? (
        <GraphViewer snapshotId={current.id} />
      ) : (
        <div className="border rounded-lg p-8 text-center text-gray-500">
          시각화 파일이 없습니다 (--no-viz 모드로 빌드됨)
        </div>
      )}

      {/* Bottom cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <GodNodesCard
          godNodes={metadata.godNodes ?? []}
          nodeCount={current.nodeCount ?? 0}
          edgeCount={current.edgeCount ?? 0}
          communityCount={current.communityCount ?? 0}
        />

        <div className="border rounded-lg p-4">
          <h3 className="font-semibold mb-2">{t('buildInfo')}</h3>
          <dl className="text-sm space-y-1">
            <div className="flex justify-between">
              <dt className="text-gray-500">{t('mode')}</dt>
              <dd>{current.buildMode}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">{t('duration')}</dt>
              <dd>
                {current.buildDurationMs
                  ? `${(current.buildDurationMs / 1000).toFixed(1)}s`
                  : '-'}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">{t('files')}</dt>
              <dd>{current.fileCount ?? '-'}</dd>
            </div>
          </dl>
        </div>

        <SuggestedQuestions questions={metadata.suggestedQuestions ?? []} />
      </div>
    </main>
  );
}
