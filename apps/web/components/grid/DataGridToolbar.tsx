"use client";

import { type ReactNode } from "react";
import { Button } from "@/components/ui/button";

export type DataGridToolbarProps = {
  children?: ReactNode;
  onExport?: () => void | Promise<void>;
  exportLabel?: string;
  isExporting?: boolean;
};

/**
 * Toolbar wrapper providing Excel export slot via `onExport`. Compose with
 * DataGrid's built-in GridToolbar (insert/copy/save) by either:
 * - placing DataGridToolbar above DataGrid (separate strips), or
 * - passing GridToolbar's controls into `children` for a unified strip.
 *
 * All visible labels (`exportLabel`) are passthrough props — baseline carries
 * no i18n. Callers wire `t('Sales.Common.Excel.button')` etc.
 */
export function DataGridToolbar({
  children,
  onExport,
  exportLabel = "Export",
  isExporting = false,
}: DataGridToolbarProps) {
  return (
    <div className="flex items-center gap-2 border-b border-(--border-default) bg-(--bg-page) px-3 py-2">
      <div className="flex items-center gap-2">{children}</div>
      {onExport ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void onExport()}
          disabled={isExporting}
          className="ml-auto"
        >
          {exportLabel}
        </Button>
      ) : null}
    </div>
  );
}
