"use client";

import { type ReactNode } from "react";
import { Button } from "@/components/ui/button";

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
