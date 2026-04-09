'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import {
  useReactTable, getCoreRowModel, flexRender, createColumnHelper,
  type PaginationState,
} from '@tanstack/react-table';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button }  from '@/components/ui/button';
import { Input }   from '@/components/ui/input';

type Company = {
  id:             string;
  code:           string;
  name:           string;
  representative: string | null;
  category:       string | null;
  createdAt:      string;
};

const col = createColumnHelper<Company>();

export default function AdminCompaniesPage() {
  const t = useTranslations('Admin.Companies');
  const [data, setData]         = useState<Company[]>([]);
  const [total, setTotal]       = useState(0);
  const [loading, setLoading]   = useState(false);
  const [search, setSearch]     = useState('');
  const [debouncedQ, setQ]      = useState('');
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 20 });

  useEffect(() => {
    const t = setTimeout(() => setQ(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      page:  String(pagination.pageIndex + 1),
      limit: String(pagination.pageSize),
      ...(debouncedQ ? { q: debouncedQ } : {}),
    });
    const res  = await fetch(`/api/admin/companies?${params}`);
    const json = await res.json();
    setData(json.data ?? []);
    setTotal(json.meta?.total ?? 0);
    setLoading(false);
  }, [pagination, debouncedQ]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const columns = [
    col.accessor('code',           { header: 'Code' }),
    col.accessor('name',           { header: 'Company Name' }),
    col.accessor('representative', { header: 'Representative', cell: (i) => i.getValue() ?? '—' }),
    col.accessor('category',       { header: 'Category',       cell: (i) => i.getValue() ?? '—' }),
  ];

  const table = useReactTable({
    data, columns,
    pageCount: Math.ceil(total / pagination.pageSize),
    state: { pagination },
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground text-sm mt-1">{t('description')}</p>
      </div>

      <div className="flex items-center gap-3">
        <Input
          placeholder={t('searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((h) => (
                  <TableHead key={h.id}>{flexRender(h.column.columnDef.header, h.getContext())}</TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={columns.length} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
            ) : table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{t('total', { count: total })}</span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>{t('pagination.previous')}</Button>
          <span className="self-center">Page {pagination.pageIndex + 1} / {table.getPageCount()}</span>
          <Button variant="outline" size="sm" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>{t('pagination.next')}</Button>
        </div>
      </div>
    </div>
  );
}
