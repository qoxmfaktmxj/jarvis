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
    <div className="space-y-4">
      <VisNetwork data={data} onNodeClick={handleNodeClick} />

      <div className="flex items-center gap-6 text-sm text-gray-600">
        <span>
          {t('nodeCount')}: <strong>{data.nodes.length}</strong>
        </span>
        <span>
          {t('edgeCount')}: <strong>{data.edges.length}</strong>
        </span>
      </div>
    </div>
  );
}
