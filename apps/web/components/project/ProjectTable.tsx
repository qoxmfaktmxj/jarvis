"use client";

import * as React from "react";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable
} from "@tanstack/react-table";
import { ChevronDown, ChevronUp, ChevronsUpDown, Eye } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ProjectListItem } from "@/lib/queries/projects";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

type Props = {
  data: ProjectListItem[];
  page: number;
  totalPages: number;
  total: number;
};

const columnHelper = createColumnHelper<ProjectListItem>();

const statusVariant: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  active: "default",
  "on-hold": "secondary",
  completed: "outline",
  archived: "destructive"
};

function formatDate(value: string | null) {
  return value ? value : "-";
}

export function ProjectTable({ data, page, totalPages, total }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [sorting, setSorting] = React.useState<SortingState>([]);

  const columns = [
    columnHelper.accessor("code", {
      header: "Code",
      cell: (info) => (
        <span className="font-mono text-xs font-semibold text-gray-600">
          {info.getValue()}
        </span>
      )
    }),
    columnHelper.accessor("name", {
      header: "Name",
      cell: (info) => <span className="font-medium text-gray-900">{info.getValue()}</span>
    }),
    columnHelper.accessor("status", {
      header: "Status",
      cell: (info) => {
        const value = info.getValue() ?? "active";
        return <Badge variant={statusVariant[value] ?? "default"}>{value}</Badge>;
      }
    }),
    columnHelper.accessor("startDate", {
      header: "Start",
      cell: (info) => formatDate(info.getValue())
    }),
    columnHelper.accessor("endDate", {
      header: "End",
      cell: (info) => formatDate(info.getValue())
    }),
    columnHelper.accessor("taskCount", {
      header: "Tasks",
      cell: (info) => info.getValue()
    }),
    columnHelper.accessor("staffCount", {
      header: "Staff",
      cell: (info) => info.getValue()
    }),
    columnHelper.display({
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <Button
          size="sm"
          variant="ghost"
          className="gap-1"
          onClick={() => router.push(`/projects/${row.original.id}`)}
        >
          <Eye className="h-4 w-4" />
          View
        </Button>
      )
    })
  ];

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel()
  });

  function moveToPage(nextPage: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(nextPage));
    router.push(`/projects?${params.toString()}`);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sorted = header.column.getIsSorted();

                  return (
                    <TableHead
                      key={header.id}
                      className={cn(canSort && "cursor-pointer select-none")}
                      onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                    >
                      <span className="inline-flex items-center gap-1">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {canSort &&
                          (sorted === "asc" ? (
                            <ChevronUp className="h-3 w-3" />
                          ) : sorted === "desc" ? (
                            <ChevronDown className="h-3 w-3" />
                          ) : (
                            <ChevronsUpDown className="h-3 w-3 opacity-40" />
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
                <TableCell colSpan={columns.length} className="py-10 text-center text-gray-500">
                  No projects found.
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

      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>
          Showing page {page} of {totalPages} · {total} total
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => moveToPage(page - 1)}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => moveToPage(page + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
