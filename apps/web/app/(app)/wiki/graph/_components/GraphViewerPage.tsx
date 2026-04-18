// apps/web/app/(app)/wiki/graph/_components/GraphViewerPage.tsx
'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';
import type { GraphData } from '@/components/GraphViewer/VisNetwork';

// vis-network depends on the DOM, so it must not run during SSR.
const VisNetwork = dynamic(
  () => import('@/components/GraphViewer/VisNetwork').then((m) => m.VisNetwork),
  {
    ssr: false,
    loading: () => <Skeleton className="h-[600px] w-full rounded-lg" />,
  },
);

interface GraphViewerPageProps {
  data: GraphData;
}

export function GraphViewerPage({ data }: GraphViewerPageProps) {
  const t = useTranslations('WikiGraph');
  const router = useRouter();

  const handleNodeClick = useCallback(
    (_nodeId: string, pageSlug?: string) => {
      if (!pageSlug) return;
      router.push(`/wiki/default/${pageSlug}`);
    },
    [router],
  );

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-md border border-surface-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
        <VisNetwork data={data} onNodeClick={handleNodeClick} />
      </div>

      <div className="flex items-center gap-2">
        <GraphStat label={t('nodeCount')} value={data.nodes.length} tone="isu" />
        <GraphStat label={t('edgeCount')} value={data.edges.length} tone="neutral" />
        <span className="text-display ml-auto flex items-center gap-1 text-[11px] text-surface-400">
          <span className="h-1.5 w-1.5 rounded-full bg-isu-500" aria-hidden />
          클릭하여 페이지로 이동
        </span>
      </div>
    </div>
  );
}

function GraphStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'isu' | 'neutral';
}) {
  const toneClass =
    tone === 'isu'
      ? 'bg-isu-50 text-isu-700 ring-isu-500/20'
      : 'bg-surface-50 text-surface-700 ring-surface-200';
  return (
    <span
      className={`inline-flex items-baseline gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium ring-1 ring-inset ${toneClass}`}
    >
      <span className="text-display text-[10px] uppercase tracking-wide opacity-70">
        {label}
      </span>
      <span className="text-display text-[13px] font-semibold tabular-nums">
        {value.toLocaleString()}
      </span>
    </span>
  );
}
