"use client";

import * as React from "react";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import {
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  ArrowUpRight,
  FolderKanban,
  Users,
  ListChecks,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ProjectListItem } from "@/lib/queries/projects";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

type Props = {
  data: ProjectListItem[];
  page: number;
  totalPages: number;
  total: number;
};

const columnHelper = createColumnHelper<ProjectListItem>();

/* ── Status chip system ── */

const STATUS_STYLES: Record<
  string,
  { label: string; dot: string; chip: string }
> = {
  active: {
    label: "Active",
    dot: "bg-isu-500",
    chip: "bg-isu-50 text-isu-700 ring-isu-500/20",
  },
  "on-hold": {
    label: "On hold",
    dot: "bg-amber-500",
    chip: "bg-amber-50 text-amber-800 ring-amber-600/20",
  },
  completed: {
    label: "Completed",
    dot: "bg-emerald-500",
    chip: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  },
  archived: {
    label: "Archived",
    dot: "bg-surface-400",
    chip: "bg-surface-100 text-surface-600 ring-surface-300",
  },
};

function StatusChip({ value }: { value: string }) {
  const meta = STATUS_STYLES[value] ?? STATUS_STYLES.active!;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide ring-1 ring-inset",
        meta.chip,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} aria-hidden />
      {meta.label}
    </span>
  );
}

/* ── Date formatting ── */

function formatDate(value: string | null) {
  if (!value) {
    return <span className="text-surface-300">—</span>;
  }
  return <span className="text-display tabular-nums text-surface-700">{value}</span>;
}

export function ProjectTable({ data, page, totalPages, total }: Props) {
  const t = useTranslations("Projects.table");
  const router = useRouter();
  const searchParams = useSearchParams();
  const [sorting, setSorting] = React.useState<SortingState>([]);

  const columns = React.useMemo(
    () => [
      columnHelper.accessor("code", {
        header: t("code"),
        cell: (info) => (
          <span className="text-display font-mono text-[11px] font-semibold uppercase tracking-wide text-surface-500">
            {info.getValue()}
          </span>
        ),
      }),
      columnHelper.accessor("name", {
        header: t("name"),
        cell: (info) => (
          <span className="font-medium text-surface-900 group-hover:text-isu-700">
            {info.getValue()}
          </span>
        ),
      }),
      columnHelper.accessor("status", {
        header: t("status"),
        cell: (info) => <StatusChip value={info.getValue() ?? "active"} />,
      }),
      columnHelper.accessor("startDate", {
        header: t("start"),
        cell: (info) => formatDate(info.getValue()),
      }),
      columnHelper.accessor("endDate", {
        header: t("end"),
        cell: (info) => formatDate(info.getValue()),
      }),
      columnHelper.accessor("taskCount", {
        header: t("tasks"),
        cell: (info) => (
          <span className="text-display inline-flex items-center gap-1 text-[12px] tabular-nums text-surface-700">
            <ListChecks className="h-3 w-3 text-surface-400" />
            {info.getValue()}
          </span>
        ),
      }),
      columnHelper.accessor("staffCount", {
        header: t("staff"),
        cell: (info) => (
          <span className="text-display inline-flex items-center gap-1 text-[12px] tabular-nums text-surface-700">
            <Users className="h-3 w-3 text-surface-400" />
            {info.getValue()}
          </span>
        ),
      }),
      columnHelper.display({
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-2 text-isu-600 opacity-0 transition-opacity hover:text-isu-700 group-hover:opacity-100"
            onClick={() => router.push(`/projects/${row.original.id}`)}
          >
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Button>
        ),
      }),
    ],
    [t, router],
  );

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  function moveToPage(nextPage: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(nextPage));
    router.push(`/projects?${params.toString()}`);
  }

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-md border border-surface-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
        <Table>
          <TableHeader className="bg-surface-50/70">
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id} className="border-surface-200 hover:bg-transparent">
                {group.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sorted = header.column.getIsSorted();
                  return (
                    <TableHead
                      key={header.id}
                      className={cn(
                        "text-display h-9 text-[11px] font-semibold uppercase tracking-[0.1em] text-surface-500",
                        canSort && "cursor-pointer select-none hover:text-surface-800",
                      )}
                      onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                    >
                      <span className="inline-flex items-center gap-1">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {canSort &&
                          (sorted === "asc" ? (
                            <ChevronUp className="h-3 w-3 text-isu-500" />
                          ) : sorted === "desc" ? (
                            <ChevronDown className="h-3 w-3 text-isu-500" />
                          ) : (
                            <ChevronsUpDown className="h-3 w-3 text-surface-300" />
                          ))}
                      </span>
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="py-14 text-center"
                >
                  <div className="flex flex-col items-center gap-2 text-surface-500">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-50 text-surface-400 ring-1 ring-surface-200">
                      <FolderKanban className="h-4 w-4" />
                    </span>
                    <p className="text-[13px] font-medium text-surface-700">{t("noResults")}</p>
                    <p className="text-[11px] text-surface-400">
                      필터를 초기화하거나 새 프로젝트를 만들어 보세요.
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="group cursor-pointer border-surface-100 transition-colors hover:bg-isu-50/40"
                  onClick={() => router.push(`/projects/${row.original.id}`)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="py-3">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <span className="text-display text-[12px] tabular-nums text-surface-500">
          {t("pagination", { page, totalPages, total })}
        </span>
        <div className="flex gap-1.5">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => moveToPage(page - 1)}
          >
            이전
          </Button>
          <span className="text-display inline-flex min-w-[70px] items-center justify-center rounded-md border border-surface-200 bg-surface-50 px-3 text-[12px] font-medium tabular-nums text-surface-700">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => moveToPage(page + 1)}
          >
            다음
          </Button>
        </div>
      </div>
    </div>
  );
}
