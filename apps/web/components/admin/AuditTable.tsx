'use client';

import { useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Input }  from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge }  from '@/components/ui/badge';
import { DatePicker } from '@/components/ui/DatePicker';
import type { AuditLogEntry } from '@/lib/queries/admin';

type Meta = { page: number; limit: number; total: number; totalPages: number };
type Props = { initialData: AuditLogEntry[]; meta: Meta };

const ACTION_COLORS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  CREATE: 'default',
  UPDATE: 'secondary',
  DELETE: 'destructive',
  LOGIN:  'outline',
};

export function AuditTable({ initialData, meta }: Props) {
  const t = useTranslations('Admin.Audit');
  const router      = useRouter();
  const pathname    = usePathname();
  const searchParams = useSearchParams();

  const [filters, setFilters] = useState({
    action:       searchParams.get('action')       ?? '',
    resourceType: searchParams.get('resourceType') ?? '',
    dateFrom:     searchParams.get('dateFrom')     ?? '',
    dateTo:       searchParams.get('dateTo')       ?? '',
  });

  const applyFilters = () => {
    const params = new URLSearchParams();
    if (filters.action)       params.set('action',       filters.action);
    if (filters.resourceType) params.set('resourceType', filters.resourceType);
    if (filters.dateFrom)     params.set('dateFrom',     filters.dateFrom);
    if (filters.dateTo)       params.set('dateTo',       filters.dateTo);
    router.push(`${pathname}?${params.toString()}`);
  };

  const goPage = (p: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(p));
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 items-end">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">{t('filters.action')}</p>
          <Input
            value={filters.action}
            onChange={(e) => setFilters((f) => ({ ...f, action: e.target.value }))}
            placeholder={t('filters.actionPlaceholder')}
            className="h-8 w-44 text-xs"
          />
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">{t('filters.resourceType')}</p>
          <Input
            value={filters.resourceType}
            onChange={(e) => setFilters((f) => ({ ...f, resourceType: e.target.value }))}
            placeholder={t('filters.resourceTypePlaceholder')}
            className="h-8 w-36 text-xs"
          />
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">{t('filters.from')}</p>
          <DatePicker
            value={filters.dateFrom || null}
            onChange={(v) => setFilters((f) => ({ ...f, dateFrom: v ?? '' }))}
            className="w-36"
          />
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">{t('filters.to')}</p>
          <DatePicker
            value={filters.dateTo || null}
            onChange={(v) => setFilters((f) => ({ ...f, dateTo: v ?? '' }))}
            className="w-36"
          />
        </div>
        <Button size="sm" onClick={applyFilters} className="mb-0.5">{t('filters.apply')}</Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('columns.time')}</TableHead>
              <TableHead>{t('columns.user')}</TableHead>
              <TableHead>{t('columns.action')}</TableHead>
              <TableHead>{t('columns.resource')}</TableHead>
              <TableHead>{t('columns.ip')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {initialData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  {t('empty')}
                </TableCell>
              </TableRow>
            ) : (
              initialData.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="text-xs whitespace-nowrap">
                    {new Date(entry.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-xs">
                    {entry.userName ?? '—'}{' '}
                    <span className="text-muted-foreground">({entry.employeeId ?? '—'})</span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={ACTION_COLORS[entry.action] ?? 'outline'} className="text-xs">
                      {entry.action}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">
                    {entry.resourceType}
                    {entry.resourceId && <span className="text-muted-foreground"> #{entry.resourceId.slice(0, 8)}</span>}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{entry.ipAddress ?? '—'}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{t('total', { count: meta.total })}</span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={meta.page <= 1} onClick={() => goPage(meta.page - 1)}>
            {t('pagination.previous')}
          </Button>
          <span className="self-center">{t('pagination.page', { page: meta.page, total: meta.totalPages })}</span>
          <Button variant="outline" size="sm" disabled={meta.page >= meta.totalPages} onClick={() => goPage(meta.page + 1)}>
            {t('pagination.next')}
          </Button>
        </div>
      </div>
    </div>
  );
}
