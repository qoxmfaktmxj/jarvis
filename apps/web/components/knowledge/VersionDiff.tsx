'use client';

import { useEffect, useState } from 'react';
import { diffLines, type Change } from 'diff';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { X } from 'lucide-react';

interface VersionDiffProps {
  pageId: string;
  versionIdA: string;
  versionIdB: string;
  onClose: () => void;
}

interface VersionContent {
  versionNumber: number;
  mdxContent: string;
  changeNote?: string | null;
}

async function fetchVersionContent(pageId: string, versionId: string): Promise<VersionContent> {
  const res = await fetch(`/api/knowledge/${pageId}/versions/${versionId}`);
  if (!res.ok) throw new Error('Failed to load version');
  return res.json() as Promise<VersionContent>;
}

function DiffLine({ change }: { change: Change }) {
  if (change.added) {
    return (
      <div className="bg-green-50 border-l-2 border-green-500 px-3 py-0.5 font-mono text-xs text-green-800 whitespace-pre-wrap">
        + {change.value}
      </div>
    );
  }
  if (change.removed) {
    return (
      <div className="bg-red-50 border-l-2 border-red-500 px-3 py-0.5 font-mono text-xs text-red-800 whitespace-pre-wrap line-through opacity-80">
        - {change.value}
      </div>
    );
  }
  return (
    <div className="px-3 py-0.5 font-mono text-xs text-gray-500 whitespace-pre-wrap">
      &nbsp;&nbsp;{change.value}
    </div>
  );
}

export function VersionDiff({ pageId, versionIdA, versionIdB, onClose }: VersionDiffProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [changes, setChanges] = useState<Change[]>([]);
  const [labelA, setLabelA] = useState('');
  const [labelB, setLabelB] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      fetchVersionContent(pageId, versionIdA),
      fetchVersionContent(pageId, versionIdB),
    ])
      .then(([a, b]) => {
        if (cancelled) return;
        setLabelA(`v${a.versionNumber}${a.changeNote ? ` — ${a.changeNote}` : ''}`);
        setLabelB(`v${b.versionNumber}${b.changeNote ? ` — ${b.changeNote}` : ''}`);
        setChanges(diffLines(a.mdxContent, b.mdxContent));
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError((err as Error).message ?? 'Failed to load diff');
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [pageId, versionIdA, versionIdB]);

  const added = changes.filter((c) => c.added).reduce((n, c) => n + (c.count ?? 0), 0);
  const removed = changes.filter((c) => c.removed).reduce((n, c) => n + (c.count ?? 0), 0);

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
        <DialogHeader className="flex-none">
          <div className="flex items-center justify-between">
            <DialogTitle>Version Comparison</DialogTitle>
            <DialogClose asChild>
              <Button variant="ghost" size="sm" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            </DialogClose>
          </div>
          {!loading && !error && (
            <div className="flex gap-4 text-sm text-gray-500 mt-1">
              <span className="font-mono">{labelA}</span>
              <span>→</span>
              <span className="font-mono">{labelB}</span>
              <span className="ml-auto text-green-600">+{added} lines</span>
              <span className="text-red-600">-{removed} lines</span>
            </div>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto rounded-md border border-gray-200 bg-white">
          {loading && (
            <div className="p-4 space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-4 w-full" />
              ))}
            </div>
          )}
          {error && (
            <div className="p-4 text-sm text-red-600">{error}</div>
          )}
          {!loading && !error && (
            <div className="divide-y divide-gray-100">
              {changes.map((change, i) => (
                <DiffLine key={i} change={change} />
              ))}
              {changes.length === 0 && (
                <p className="p-4 text-sm text-gray-400 italic">No differences found.</p>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
