// apps/web/app/(app)/architecture/components/GraphViewer.tsx
'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';

interface GraphViewerProps {
  snapshotId: string;
}

export function GraphViewer({ snapshotId }: GraphViewerProps) {
  const t = useTranslations('Architecture.Graph');
  const [iframeSrc, setIframeSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    // Fetch presigned URL as JSON (API returns { url: string })
    fetch(`/api/graphify/snapshots/${snapshotId}/graph?type=html`)
      .then(async (res) => {
        if (!res.ok) {
          setError('Failed to load graph visualization');
          return;
        }
        const data = (await res.json()) as { url?: string };
        if (data.url) {
          setIframeSrc(data.url);
        } else {
          setError('No graph URL returned');
        }
      })
      .catch(() => setError('Network error loading graph'))
      .finally(() => setLoading(false));
  }, [snapshotId]);

  if (loading) {
    return (
      <div className="flex h-[600px] items-center justify-center rounded-lg border border-border bg-muted/40">
        <span className="text-muted-foreground">{t('loading')}</span>
      </div>
    );
  }

  if (error || !iframeSrc) {
    return (
      <div className="flex h-[600px] items-center justify-center rounded-lg border border-border bg-muted/40">
        <span className="text-muted-foreground">{error ?? 'Graph not available'}</span>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <iframe
        src={iframeSrc}
        className="h-[600px] w-full"
        sandbox="allow-scripts allow-same-origin"
        title="Architecture Graph"
      />
    </div>
  );
}
