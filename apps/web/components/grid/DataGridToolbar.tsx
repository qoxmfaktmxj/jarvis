"use client";

import { type ReactNode } from "react";

export type DataGridToolbarProps = {
  children?: ReactNode;
  onExport?: () => void | Promise<void>;
  exportLabel?: string;
  isExporting?: boolean;
};

export function DataGridToolbar({
  children,
  onExport,
  exportLabel = "Export",
  isExporting = false,
}: DataGridToolbarProps) {
  return (
    <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-3 py-2">
      <div className="flex items-center gap-2">{children}</div>
      {onExport ? (
        <button
          type="button"
          onClick={() => void onExport()}
          disabled={isExporting}
          className="ml-auto inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
        >
          {exportLabel}
        </button>
      ) : null}
    </div>
  );
}
