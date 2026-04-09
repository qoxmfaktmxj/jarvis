// apps/web/app/(app)/architecture/components/GraphViewer.tsx
'use client';

import { useState, useEffect } from 'react';

interface GraphViewerProps {
  snapshotId: string;
}

export function GraphViewer({ snapshotId }: GraphViewerProps) {
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
      <div className="border rounded-lg h-[600px] flex items-center justify-center bg-gray-50">
        <span className="text-gray-400">Loading graph...</span>
      </div>
    );
  }

  if (error || !iframeSrc) {
    return (
      <div className="border rounded-lg h-[600px] flex items-center justify-center bg-gray-50">
        <span className="text-gray-500">{error ?? 'Graph not available'}</span>
      </div>
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <iframe
        src={iframeSrc}
        className="w-full h-[600px]"
        sandbox="allow-scripts allow-same-origin"
        title="Architecture Graph"
      />
    </div>
  );
}
