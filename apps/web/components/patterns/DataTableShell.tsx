import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";

export type DataTableShellProps = {
  children: ReactNode;
  filters?: ReactNode;
  pagination?: ReactNode;
  empty?: ReactNode;
  isLoading?: boolean;
  rowCount?: number;
};

export function DataTableShell({
  children,
  filters,
  pagination,
  empty,
  isLoading = false,
  rowCount = 0,
}: DataTableShellProps) {
  return (
    <section className="space-y-4">
      {filters ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-(--border-default) bg-(--bg-surface) p-3">
          {filters}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-(--border-default) bg-card">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : rowCount === 0 && empty ? (
          empty
        ) : (
          children
        )}
      </div>

      {pagination ? (
        <div className="flex items-center justify-between text-sm text-(--fg-secondary)">
          {pagination}
        </div>
      ) : null}
    </section>
  );
}
