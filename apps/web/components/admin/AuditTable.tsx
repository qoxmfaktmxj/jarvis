'use client';

import { useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Input }  from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge }  from '@/components/ui/badge';
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
          <p className="text-xs text-muted-foreground">Action</p>
          <Input
            value={filters.action}
            onChange={(e) => setFilters((f) => ({ ...f, action: e.target.value }))}
            placeholder="CREATE / UPDATE / DELETE"
            className="h-8 w-44 text-xs"
          />
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Resource Type</p>
          <Input
            value={filters.resourceType}
            onChange={(e) => setFilters((f) => ({ ...f, resourceType: e.target.value }))}
            placeholder="user / page / ..."
            className="h-8 w-36 text-xs"
          />
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">From</p>
          <Input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
            className="h-8 w-36 text-xs"
          />
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">To</p>
          <Input
            type="date"
            value={filters.dateTo}
            onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
            className="h-8 w-36 text-xs"
          />
        </div>
        <Button size="sm" onClick={applyFilters} className="mb-0.5">Apply</Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Resource</TableHead>
              <TableHead>IP</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {initialData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  No audit entries found.
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
        <span>Total: {meta.total} entries</span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={meta.page <= 1} onClick={() => goPage(meta.page - 1)}>
            Previous
          </Button>
          <span className="self-center">Page {meta.page} / {meta.totalPages}</span>
          <Button variant="outline" size="sm" disabled={meta.page >= meta.totalPages} onClick={() => goPage(meta.page + 1)}>
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
