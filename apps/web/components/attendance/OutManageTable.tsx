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
import { Eye, CheckCircle2, XCircle, ArrowUpDown } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import type { OutManageRecord } from '@/lib/queries/attendance';

const STATUS_BADGE: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
  pending:  { variant: 'outline',     label: 'Pending' },
  approved: { variant: 'default',     label: 'Approved' },
  rejected: { variant: 'destructive', label: 'Rejected' },
};

const OUT_TYPE_LABELS: Record<string, string> = {
  'client-visit': 'Client Visit',
  errand:         'Errand',
  remote:         'Remote Work',
  training:       'Training',
  other:          'Other',
};

const helper = createColumnHelper<OutManageRecord>();

interface OutManageTableProps {
  records: OutManageRecord[];
  isManager?: boolean;
  onViewDetails: (record: OutManageRecord) => void;
}

export function OutManageTable({ records, isManager = false, onViewDetails }: OutManageTableProps) {
  const router = useRouter();
  const [sorting, setSorting] = React.useState<SortingState>([{ id: 'outDate', desc: true }]);
  const [actionLoading, setActionLoading] = React.useState<string | null>(null);

  const handleApproval = React.useCallback(async (id: string, action: 'approve' | 'reject') => {
    setActionLoading(id + action);
    try {
      const res = await fetch('/api/attendance/out-manage', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error ?? 'Action failed');
        return;
      }
      router.refresh();
    } finally {
      setActionLoading(null);
    }
  }, [router]);

  const columns = React.useMemo(
    () => [
      helper.accessor('outDate', {
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-3 h-8"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            Date
            <ArrowUpDown className="ml-2 h-3.5 w-3.5 text-gray-400" />
          </Button>
        ),
        cell: ({ getValue }) => (
          <span className="font-medium tabular-nums">
            {format(parseISO(getValue()), 'yyyy-MM-dd')}
          </span>
        ),
      }),
      helper.accessor('outType', {
        header: 'Type',
        cell: ({ getValue }) => (
          <span>{OUT_TYPE_LABELS[getValue()] ?? getValue()}</span>
        ),
        enableSorting: false,
      }),
      helper.accessor('destination', {
        header: 'Destination',
        cell: ({ getValue }) => {
          const v = getValue();
          return v ? (
            <span className="max-w-[160px] truncate" title={v}>{v}</span>
          ) : (
            <span className="text-gray-300">—</span>
          );
        },
        enableSorting: false,
      }),
      helper.accessor('status', {
        header: 'Status',
        cell: ({ getValue }) => {
          const s = getValue() ?? 'pending';
          const cfg = STATUS_BADGE[s] ?? { variant: 'secondary' as const, label: s };
          return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
        },
        enableSorting: false,
      }),
      helper.display({
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                title="View details"
                onClick={() => onViewDetails(r)}
              >
                <Eye className="h-4 w-4" />
              </Button>
              {isManager && r.status === 'pending' && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Approve"
                    className="text-green-600 hover:text-green-700"
                    disabled={actionLoading !== null}
                    onClick={() => handleApproval(r.id, 'approve')}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Reject"
                    className="text-red-500 hover:text-red-600"
                    disabled={actionLoading !== null}
                    onClick={() => handleApproval(r.id, 'reject')}
                  >
                    <XCircle className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          );
        },
      }),
    ],
    [actionLoading, handleApproval, isManager, onViewDetails],
  );

  const table = useReactTable({
    data: records,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
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
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center text-gray-500">
                No out-of-office requests found.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
