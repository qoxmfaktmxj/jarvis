'use client';

import * as React from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from '@tanstack/react-table';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, ArrowUpDown } from 'lucide-react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import type { AttendanceRecord } from '@/lib/queries/attendance';

const STATUS_BADGE: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
  present:    { variant: 'default',     label: 'Present' },
  late:       { variant: 'outline',     label: 'Late' },
  absent:     { variant: 'destructive', label: 'Absent' },
  remote:     { variant: 'secondary',   label: 'Remote' },
  'half-day': { variant: 'outline',     label: 'Half-day' },
};

function formatTime(ts: Date | string | null): string {
  if (!ts) return '—';
  return format(new Date(ts as string), 'HH:mm');
}

function formatDuration(checkIn: Date | string | null, checkOut: Date | string | null): string {
  if (!checkIn || !checkOut) return '—';
  const diffMin = Math.round(
    (new Date(checkOut as string).getTime() - new Date(checkIn as string).getTime()) / 60000,
  );
  if (diffMin < 0) return '—';
  return `${Math.floor(diffMin / 60)}h ${diffMin % 60}m`;
}

const helper = createColumnHelper<AttendanceRecord>();

const columns = [
  helper.accessor('attendDate', {
    header: ({ column }) => (
      <Button
        variant="ghost"
        size="sm"
        className="-ml-3 h-8"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Date
        <ArrowUpDown className="ml-2 h-3.5 w-3.5 text-surface-400" />
      </Button>
    ),
    cell: ({ getValue }) => {
      const v = getValue();
      return <span className="font-medium tabular-nums">{format(parseISO(v), 'MM/dd (EEE)')}</span>;
    },
  }),
  helper.accessor('status', {
    header: 'Status',
    cell: ({ getValue }) => {
      const s = getValue() ?? 'present';
      const cfg = STATUS_BADGE[s] ?? { variant: 'secondary' as const, label: s };
      return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
    },
    enableSorting: false,
  }),
  helper.accessor('checkIn', {
    header: 'Check-in',
    cell: ({ getValue }) => <span className="tabular-nums">{formatTime(getValue())}</span>,
    enableSorting: false,
  }),
  helper.accessor('checkOut', {
    header: 'Check-out',
    cell: ({ getValue }) => <span className="tabular-nums">{formatTime(getValue())}</span>,
    enableSorting: false,
  }),
  helper.display({
    id: 'duration',
    header: 'Duration',
    cell: ({ row }) => (
      <span className="tabular-nums">
        {formatDuration(row.original.checkIn, row.original.checkOut)}
      </span>
    ),
  }),
  helper.accessor('note', {
    header: 'Note',
    cell: ({ getValue }) => {
      const v = getValue();
      return v ? (
        <span className="max-w-[180px] truncate text-sm text-surface-500" title={v}>{v}</span>
      ) : (
        <span className="text-surface-300">—</span>
      );
    },
    enableSorting: false,
  }),
];

interface AttendanceTableProps {
  records: AttendanceRecord[];
  month: string; // YYYY-MM
}

export function AttendanceTable({ records, month }: AttendanceTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [sorting, setSorting] = React.useState<SortingState>([{ id: 'attendDate', desc: false }]);

  const table = useReactTable({
    data: records,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  function navigate(direction: 'prev' | 'next') {
    const navParts = month.split('-');
    const year = Number(navParts[0]);
    const mon = Number(navParts[1]);
    const d = new Date(year, mon - 1 + (direction === 'next' ? 1 : -1), 1);
    const newMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const params = new URLSearchParams(searchParams.toString());
    params.set('month', newMonth);
    router.push(`${pathname}?${params.toString()}`);
  }

  const displayParts = month.split('-');
  const displayYear = Number(displayParts[0]);
  const displayMon = Number(displayParts[1]);
  const monthLabel = new Date(displayYear, displayMon - 1, 1).toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="space-y-3">
      {/* Month navigation */}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={() => navigate('prev')} aria-label="Previous month">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="min-w-36 text-center text-sm font-medium">{monthLabel}</span>
        <Button variant="outline" size="icon" onClick={() => navigate('next')} aria-label="Next month">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} data-state={row.getIsSelected() ? 'selected' : undefined}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-surface-500">
                  No attendance records for this month.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
