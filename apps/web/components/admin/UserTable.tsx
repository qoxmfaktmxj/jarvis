'use client';

import { useState, useCallback, useEffect } from 'react';
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
import { Badge }   from '@/components/ui/badge';
import { Button }  from '@/components/ui/button';
import { Input }   from '@/components/ui/input';
import { UserForm } from './UserForm';
import type { UserWithOrg } from '@/lib/queries/admin';

type Props = {
  orgOptions: Array<{ id: string; name: string }>;
};

const columnHelper = createColumnHelper<UserWithOrg>();

export function UserTable({ orgOptions }: Props) {
  const t = useTranslations('Admin.Users');
  const [data, setData]         = useState<UserWithOrg[]>([]);
  const [total, setTotal]       = useState(0);
  const [loading, setLoading]   = useState(false);
  const [search, setSearch]     = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 20 });
  const [editTarget, setEditTarget] = useState<UserWithOrg | null>(null);
  const [formOpen, setFormOpen]     = useState(false);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page:  String(pagination.pageIndex + 1),
        limit: String(pagination.pageSize),
        ...(debouncedQ ? { q: debouncedQ } : {}),
      });
      const res  = await fetch(`/api/admin/users?${params}`);
      const json = await res.json();
      setData(json.data ?? []);
      setTotal(json.meta?.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [pagination, debouncedQ]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleDeactivate = async (id: string) => {
    if (!confirm('Deactivate this user?')) return;
    await fetch(`/api/admin/users?id=${id}`, { method: 'DELETE' });
    fetchData();
  };

  const columns = [
    columnHelper.accessor('employeeId', { header: t('columns.employeeId') }),
    columnHelper.accessor('name',       { header: t('columns.name') }),
    columnHelper.accessor('email',      { header: t('columns.email'), cell: (i) => i.getValue() ?? '—' }),
    columnHelper.accessor('orgName',    { header: t('columns.organization'), cell: (i) => i.getValue() ?? '—' }),
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
    columnHelper.accessor('isActive', {
      header: t('columns.status'),
      cell: (i) => (
        <Badge variant={i.getValue() ? 'default' : 'destructive'}>
          {i.getValue() ? t('status.active') : t('status.inactive')}
        </Badge>
      ),
    }),
    columnHelper.display({
      id: 'actions',
      header: t('columns.actions'),
      cell: ({ row }) => (
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setEditTarget(row.original); setFormOpen(true); }}
          >
            {t('actions.edit')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={!row.original.isActive}
            onClick={() => handleDeactivate(row.original.id)}
          >
            {t('actions.deactivate')}
          </Button>
        </div>
      ),
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
      <div className="flex items-center justify-between">
        <Input
          placeholder={t('searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <Button onClick={() => { setEditTarget(null); setFormOpen(true); }}>
          {t('addUser')}
        </Button>
      </div>

      <div className="rounded-md border">
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
        onSuccess={() => { setFormOpen(false); fetchData(); }}
      />
    </div>
  );
}
