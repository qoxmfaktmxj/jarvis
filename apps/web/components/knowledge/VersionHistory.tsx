'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { GitCompare } from 'lucide-react';
import { VersionDiff } from './VersionDiff';
import type { PageVersion } from '@/lib/queries/knowledge';

interface VersionHistoryProps {
  versions: PageVersion[];
  pageId: string;
}

export function VersionHistory({ versions, pageId }: VersionHistoryProps) {
  const t = useTranslations('Knowledge.VersionHistory');
  const [compareA, setCompareA] = useState<string | null>(null);
  const [compareB, setCompareB] = useState<string | null>(null);
  const [diffOpen, setDiffOpen] = useState(false);

  const handleCompare = (versionId: string) => {
    if (!compareA) {
      setCompareA(versionId);
    } else if (!compareB && versionId !== compareA) {
      setCompareB(versionId);
      setDiffOpen(true);
    } else {
      // Reset and start again
      setCompareA(versionId);
      setCompareB(null);
      setDiffOpen(false);
    }
  };

  const handleCloseDiff = () => {
    setDiffOpen(false);
    setCompareA(null);
    setCompareB(null);
  };

  const selectedCount = [compareA, compareB].filter(Boolean).length;

  return (
    <div className="space-y-4">
      {selectedCount > 0 && (
        <div className="flex items-center gap-2 text-sm text-gray-500 bg-gray-50 rounded-md px-3 py-2">
          <GitCompare className="h-4 w-4" />
          {selectedCount === 1
            ? 'Select another version to compare'
            : 'Comparing two versions…'}
          <Button variant="ghost" size="sm" className="ml-auto h-6" onClick={handleCloseDiff}>
            Clear
          </Button>
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">Version</TableHead>
            <TableHead>{t('changeNote')}</TableHead>
            <TableHead>{t('author')}</TableHead>
            <TableHead>{t('date')}</TableHead>
            <TableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {versions.map((v, idx) => (
            <TableRow key={v.id}>
              <TableCell>
                <Badge variant={idx === 0 ? 'default' : 'secondary'}>v{v.versionNumber}</Badge>
              </TableCell>
              <TableCell className="max-w-xs truncate">{v.changeNote ?? '—'}</TableCell>
              <TableCell className="text-sm text-gray-500">
                {v.authorName ?? v.authorEmail ?? 'Unknown'}
              </TableCell>
              <TableCell className="text-sm text-gray-500">
                {v.createdAt
                  ? formatDistanceToNow(new Date(v.createdAt), { addSuffix: true })
                  : '—'}
              </TableCell>
              <TableCell>
                <Button
                  variant={compareA === v.id || compareB === v.id ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleCompare(v.id)}
                >
                  {compareA === v.id || compareB === v.id ? 'Selected' : 'Compare'}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {diffOpen && compareA && compareB && (
        <VersionDiff
          pageId={pageId}
          versionIdA={compareA}
          versionIdB={compareB}
          onClose={handleCloseDiff}
        />
      )}
    </div>
  );
}
