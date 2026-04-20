'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
  type PaginationState,
} from '@tanstack/react-table';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge }  from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input }  from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { UserForm } from './UserForm';
import type { UserWithOrg, CodeOption, UserStatus } from '@/lib/queries/admin';

type Props = {
  orgOptions:      Array<{ id: string; name: string }>;
  positionOptions: CodeOption[];
  jobTitleOptions: CodeOption[];
};

const columnHelper = createColumnHelper<UserWithOrg>();

export function UserTable({ orgOptions, positionOptions, jobTitleOptions }: Props) {
  const t = useTranslations('Admin.Users');
  const [data, setData]             = useState<UserWithOrg[]>([]);
  const [total, setTotal]           = useState(0);
  const [loading, setLoading]       = useState(false);
  const [search, setSearch]         = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [statusFilter, setStatusFilter] = useState<UserStatus | 'all'>('all');
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 20 });
  const [editTarget, setEditTarget] = useState<UserWithOrg | null>(null);
  const [formOpen, setFormOpen]     = useState(false);

  const positionLabelMap = useMemo(
    () => new Map(positionOptions.map((o) => [o.code, o.label])),
    [positionOptions],
  );
  const jobTitleLabelMap = useMemo(
    () => new Map(jobTitleOptions.map((o) => [o.code, o.label])),
    [jobTitleOptions],
  );

  useEffect(() => {
    const h = setTimeout(() => setDebouncedQ(search), 400);
    return () => clearTimeout(h);
  }, [search]);

  const buildQuery = useCallback(() => {
    const params = new URLSearchParams({
      page:  String(pagination.pageIndex + 1),
      limit: String(pagination.pageSize),
    });
    if (debouncedQ) params.set('q', debouncedQ);
    if (statusFilter !== 'all') params.set('status', statusFilter);
    return params;
  }, [pagination, debouncedQ, statusFilter]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch(`/api/admin/users?${buildQuery()}`);
      const json = await res.json();
      setData(json.data ?? []);
      setTotal(json.meta?.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [buildQuery]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleDeactivate = async (id: string) => {
    if (!confirm('Deactivate this user?')) return;
    await fetch(`/api/admin/users?id=${id}`, { method: 'DELETE' });
    fetchData();
  };

  const handleToggleLock = async (u: UserWithOrg) => {
    const next: UserStatus = u.status === 'locked' ? 'active' : 'locked';
    await fetch('/api/admin/users', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id: u.id, status: next }),
    });
    fetchData();
  };

  const handleResetPassword = async (id: string) => {
    const res = await fetch('/api/admin/users/reset-password', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id }),
    });
    if (res.ok) alert(t('toast.passwordResetStub'));
  };

  const handleExport = () => {
    const params = buildQuery();
    params.delete('page');
    params.delete('limit');
    params.set('format', 'csv');
    window.location.href = `/api/admin/users/export?${params.toString()}`;
  };

  const columns = [
    columnHelper.accessor('employeeId', { header: t('columns.employeeId') }),
    columnHelper.accessor('name',       { header: t('columns.name') }),
    columnHelper.accessor('email',      { header: t('columns.email'),        cell: (i) => i.getValue() ?? '—' }),
    columnHelper.accessor('orgName',    { header: t('columns.organization'), cell: (i) => i.getValue() ?? '—' }),
    columnHelper.accessor('position',   {
      header: t('columns.position'),
      cell: (i) => {
        const code = i.getValue();
        return code ? (positionLabelMap.get(code) ?? code) : '—';
      },
    }),
    columnHelper.accessor('jobTitle', {
      header: t('columns.jobTitle'),
      cell: (i) => {
        const code = i.getValue();
        return code ? (jobTitleLabelMap.get(code) ?? code) : '—';
      },
    }),
    columnHelper.accessor('roles', {
      header: t('columns.roles'),
      cell: (i) => (
        <div className="flex flex-wrap gap-1">
          {(i.getValue() as string[]).map((r) => (
            <Badge key={r} variant="secondary">{r}</Badge>
          ))}
        </div>
      ),
    }),
    columnHelper.accessor('status', {
      header: t('columns.status'),
      cell: ({ row }) => {
        const s = row.original.status;
        const variant = s === 'active' ? 'default' : s === 'locked' ? 'outline' : 'destructive';
        return (
          <div className="flex flex-wrap gap-1">
            <Badge variant={variant}>{t(`status.${s}`)}</Badge>
            {row.original.isOutsourced && <Badge variant="outline">{t('status.outsourced')}</Badge>}
          </div>
        );
      },
    }),
    columnHelper.display({
      id: 'actions',
      header: t('columns.actions'),
      cell: ({ row }) => {
        const u = row.original;
        const isInactive = u.status === 'inactive';
        return (
          <div className="flex gap-1 flex-wrap">
            <Button variant="outline" size="sm"
              onClick={() => { setEditTarget(u); setFormOpen(true); }}>
              {t('actions.edit')}
            </Button>
            <Button variant="secondary" size="sm" disabled={isInactive}
              onClick={() => handleToggleLock(u)}>
              {u.status === 'locked' ? t('actions.unlock') : t('actions.lock')}
            </Button>
            <Button variant="secondary" size="sm"
              onClick={() => handleResetPassword(u.id)}>
              {t('actions.resetPassword')}
            </Button>
            <Button variant="secondary" size="sm" disabled={isInactive}
              onClick={() => handleDeactivate(u.id)}>
              {t('actions.deactivate')}
            </Button>
          </div>
        );
      },
    }),
  ];

  const table = useReactTable({
    data,
    columns,
    pageCount:    Math.ceil(total / pagination.pageSize),
    state:        { pagination },
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Input
            placeholder={t('searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as UserStatus | 'all')}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('filter.statusAll')}</SelectItem>
              <SelectItem value="active">{t('status.active')}</SelectItem>
              <SelectItem value="inactive">{t('status.inactive')}</SelectItem>
              <SelectItem value="locked">{t('status.locked')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleExport}>{t('actions.export')}</Button>
          <Button onClick={() => { setEditTarget(null); setFormOpen(true); }}>
            {t('addUser')}
          </Button>
        </div>
      </div>

      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((h) => (
                  <TableHead key={h.id}>
                    {flexRender(h.column.columnDef.header, h.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-center py-8 text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-center py-8 text-muted-foreground">
                  No users found.
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>Total: {total} users</span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!table.getCanPreviousPage()}
            onClick={() => table.previousPage()}
          >
            Previous
          </Button>
          <span className="self-center">
            Page {pagination.pageIndex + 1} / {table.getPageCount()}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={!table.getCanNextPage()}
            onClick={() => table.nextPage()}
          >
            Next
          </Button>
        </div>
      </div>

      <UserForm
        open={formOpen}
        onOpenChange={setFormOpen}
        defaultValues={editTarget ?? undefined}
        orgOptions={orgOptions}
        positionOptions={positionOptions}
        jobTitleOptions={jobTitleOptions}
        onSuccess={() => { setFormOpen(false); fetchData(); }}
      />
    </div>
  );
}
