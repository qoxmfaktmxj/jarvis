// apps/web/app/(app)/architecture/page.tsx

import { getTranslations } from 'next-intl/server';
import { requirePageSession } from '@/lib/server/page-auth';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { db } from '@jarvis/db/client';
import { graphSnapshot } from '@jarvis/db/schema/graph';
import { eq, desc, notInArray, and } from 'drizzle-orm';
import { PageHeader } from '@/components/patterns/PageHeader';
import { EmptyState } from '@/components/patterns/EmptyState';
import { Network } from 'lucide-react';
import { GraphViewer } from './components/GraphViewer';
import { SnapshotSelector } from './components/SnapshotSelector';
import { GodNodesCard } from './components/GodNodesCard';
import { SuggestedQuestions } from './components/SuggestedQuestions';
import { BuildLifecycleSection } from './components/BuildLifecycleSection';
import { BuildStatusCard } from './components/BuildStatusCard';

interface Props {
  searchParams: Promise<{ snapshot?: string }>;
}

export default async function ArchitecturePage({ searchParams }: Props) {
  const t = await getTranslations('Architecture');
  const session = await requirePageSession('graph:read');
  const workspaceId = session.workspaceId;
  const { snapshot: selectedId } = await searchParams;

  // Build sensitivity filter at DB level so the limit applies after authorization,
  // not before — otherwise 20 newer unauthorized snapshots could hide older done ones.
  const hasAdminAll = session.permissions.includes(PERMISSIONS.ADMIN_ALL);
  const sensitivityCondition = hasAdminAll
    ? undefined
    : notInArray(graphSnapshot.sensitivity, ['RESTRICTED', 'SECRET_REF_ONLY']);

  const authorizedSnapshots = await db
    .select()
    .from(graphSnapshot)
    .where(
      sensitivityCondition
        ? and(eq(graphSnapshot.workspaceId, workspaceId), sensitivityCondition)
        : eq(graphSnapshot.workspaceId, workspaceId),
    )
    .orderBy(desc(graphSnapshot.createdAt))
    .limit(100);

  // Prefer the explicitly selected snapshot; fall back to the most recent completed one
  const current = selectedId
    ? (authorizedSnapshots.find((s) => s.id === selectedId) ?? authorizedSnapshots.find((s) => s.buildStatus === 'done'))
    : authorizedSnapshots.find((s) => s.buildStatus === 'done');

  // Serialize for Client Components (Date → string, pick only needed fields)
  const serializedSnapshots = authorizedSnapshots.map((s) => ({
    id: s.id,
    title: s.title,
    createdAt: s.createdAt.toISOString(),
    buildMode: s.buildMode,
    buildStatus: s.buildStatus as 'pending' | 'running' | 'done' | 'error',
  }));

  return (
    <main className="p-6">
      <PageHeader
        eyebrow="Architecture"
        title={t('title')}
        meta={
          serializedSnapshots.length > 0 ? (
            <SnapshotSelector
              snapshots={serializedSnapshots}
              currentId={current?.id ?? serializedSnapshots[0]!.id}
            />
          ) : null
        }
      />

      <div className="space-y-6">
        {/* Build lifecycle overview — always visible if workspace has any snapshots */}
        <BuildLifecycleSection workspaceId={workspaceId} permissions={session.permissions} />

        {/* No snapshots at all */}
        {authorizedSnapshots.length === 0 && (
          <EmptyState
            icon={Network}
            title="No snapshots"
            description="아직 Graphify 분석 결과가 없습니다. ZIP 파일을 업로드하거나 수동으로 빌드를 트리거하세요."
          />
        )}

        {/* Current snapshot is building or errored — show status card */}
        {current && current.buildStatus !== 'done' && (
          <BuildStatusCard
            kind={current.buildStatus as 'running' | 'pending' | 'error'}
            title={current.title}
            startedAt={current.createdAt}
            error={current.buildError ?? null}
          />
        )}

        {/* Current snapshot is done — show full graph UI */}
        {current && current.buildStatus === 'done' && (() => {
          const metadata = (current.analysisMetadata ?? {}) as {
            godNodes?: string[];
            suggestedQuestions?: string[];
          };
          return (
            <>
              {current.graphHtmlPath ? (
                <GraphViewer snapshotId={current.id} />
              ) : (
                <div className="rounded-lg border border-border p-8 text-center text-muted-foreground">
                  시각화 파일이 없습니다 (--no-viz 모드로 빌드됨)
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <GodNodesCard
                  godNodes={metadata.godNodes ?? []}
                  nodeCount={current.nodeCount ?? 0}
                  edgeCount={current.edgeCount ?? 0}
                  communityCount={current.communityCount ?? 0}
                />

                <div className="rounded-lg border border-border p-4">
                  <h3 className="mb-2 font-semibold">{t('buildInfo')}</h3>
                  <dl className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">{t('mode')}</dt>
                      <dd>{current.buildMode}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">{t('duration')}</dt>
                      <dd>
                        {current.buildDurationMs
                          ? `${(current.buildDurationMs / 1000).toFixed(1)}s`
                          : '-'}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">{t('files')}</dt>
                      <dd>{current.fileCount ?? '-'}</dd>
                    </div>
                  </dl>
                </div>

                <SuggestedQuestions
                  questions={metadata.suggestedQuestions ?? []}
                  snapshotId={current.id}
                />
              </div>
            </>
          );
        })()}
      </div>
    </main>
  );
}
