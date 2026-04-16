// apps/web/app/(app)/architecture/components/GodNodesCard.tsx

'use client';

import { useTranslations } from 'next-intl';

interface GodNodesCardProps {
  godNodes: string[];
  nodeCount: number;
  edgeCount: number;
  communityCount: number;
}

export function GodNodesCard({
  godNodes,
  nodeCount,
  edgeCount,
  communityCount,
}: GodNodesCardProps) {
  const t = useTranslations('Architecture.GodNodes');
  return (
    <div className="rounded-lg border border-border p-4">
      <h3 className="mb-2 font-semibold">{t('title')}</h3>
      <p className="mb-3 text-xs text-muted-foreground">
        {nodeCount} nodes / {edgeCount} edges / {communityCount} communities
      </p>
      {godNodes.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('empty')}</p>
      ) : (
        <ul className="space-y-1">
          {godNodes.map((node, i) => (
            <li key={i} className="flex items-center gap-2 text-sm">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-isu-100 text-xs font-medium text-isu-700 dark:bg-isu-900 dark:text-isu-200">
                {i + 1}
              </span>
              {node}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
