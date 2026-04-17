'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import type { OutManageRecord } from '@/lib/queries/attendance';

const OUT_TYPE_LABELS: Record<string, string> = {
  'client-visit': 'Client Visit',
  errand:         'Errand',
  remote:         'Remote Work',
  training:       'Training',
  other:          'Other',
};

const STATUS_BADGE: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
  pending:  { variant: 'outline',     label: 'Pending' },
  approved: { variant: 'default',     label: 'Approved' },
  rejected: { variant: 'destructive', label: 'Rejected' },
};

interface TimeDetailSheetProps {
  record: OutManageRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TimeDetailSheet({ record, open, onOpenChange }: TimeDetailSheetProps) {
  const t = useTranslations('OutManage');
  if (!record) return null;

  const statusCfg = STATUS_BADGE[record.status ?? 'pending'] ?? { variant: 'secondary' as const, label: record.status };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="space-y-1">
          <SheetTitle>{t('detailTitle')}</SheetTitle>
          <SheetDescription>
            {format(new Date(record.outDate), 'MMMM d, yyyy')} &mdash;{' '}
            {OUT_TYPE_LABELS[record.outType] ?? record.outType}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-5">
          {/* Summary */}
          <div className="grid grid-cols-2 gap-y-3 text-sm">
            <span className="text-surface-500">Status</span>
            <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>

            <span className="text-surface-500">Destination</span>
            <span>{record.destination || '—'}</span>

            <span className="text-surface-500">Purpose</span>
            <span className="whitespace-pre-wrap">{record.purpose}</span>
          </div>

          {/* Time blocks */}
          {record.details.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Time Blocks</h4>
              <div className="space-y-2">
                {record.details.map((d, i) => (
                  <div
                    key={d.id}
                    className="rounded-md border bg-surface-50 px-3 py-2.5 text-sm space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium tabular-nums">
                        {format(new Date(d.timeFrom), 'HH:mm')}
                        {' – '}
                        {format(new Date(d.timeTo), 'HH:mm')}
                      </span>
                      <span className="text-xs text-surface-400">Block {i + 1}</span>
                    </div>
                    {d.activity && (
                      <p className="text-surface-500">{d.activity}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
