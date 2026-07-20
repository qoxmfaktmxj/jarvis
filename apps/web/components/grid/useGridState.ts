"use client";

import { useMemo, useState } from "react";
import type { GridRow } from "./types";

export function useGridState<Row extends { id: string }>(initialRows: Row[]) {
  const [rows, setRows] = useState<Array<GridRow<Row>>>(initialRows.map((row) => ({ ...row, _status: "clean" })));

  const dirtyCount = useMemo(() => rows.filter((row) => row._status && row._status !== "clean").length, [rows]);

  function patchRow(id: string, patch: Partial<Row>) {
    setRows((current) =>
      current.map((row) => (row.id === id
        ? { ...row, ...patch, _status: row._status === "new" ? "new" as const : "dirty" as const }
        : row)),
    );
  }

  function appendRow(row: Row) {
    setRows((current) => [...current, { ...row, _status: "new" as const }]);
  }

  function markDeleted(id: string) {
    setRows((current) => current.flatMap((row) => {
      if (row.id !== id) return [row];
      if (row._status === "new") return [];
      return [{ ...row, _status: "deleted" as const }];
    }));
  }

  function reset(nextRows: Row[]) {
    setRows(nextRows.map((row) => ({ ...row, _status: "clean" as const })));
  }

  return { rows, setRows, dirtyCount, patchRow, appendRow, markDeleted, reset };
}
