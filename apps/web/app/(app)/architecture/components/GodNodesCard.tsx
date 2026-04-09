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
    <div className="border rounded-lg p-4">
      <h3 className="font-semibold mb-2">{t('title')}</h3>
      <p className="text-xs text-gray-500 mb-3">
        {nodeCount} nodes / {edgeCount} edges / {communityCount} communities
      </p>
      {godNodes.length === 0 ? (
        <p className="text-sm text-gray-400">{t('empty')}</p>
      ) : (
        <ul className="space-y-1">
          {godNodes.map((node, i) => (
            <li key={i} className="text-sm flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-medium">
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
