"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DataGrid } from "@/components/grid/DataGrid";
import { EditableNumericCell } from "@/components/grid/cells/EditableNumericCell";
import { EditableSelectCell } from "@/components/grid/cells/EditableSelectCell";
import { EditableTextCell } from "@/components/grid/cells/EditableTextCell";
import { saveMenusAction } from "../actions";

type Row = {
  id: string;
  parentId: string | null;
  code: string;
  label: string;
  description: string | null;
  kind: "group" | "page";
  icon: string | null;
  routePath: string | null;
  sortOrder: number;
  isVisible: boolean;
  permissionCodes: string[];
};

export function MenusGridContainer(props: {
  initialRows: Row[];
  total: number;
  routeOptions: readonly string[];
  permissionOptions: readonly string[];
}) {
  const [rows, setRows] = useState(props.initialRows);

  function patchRow(id: string, patch: Partial<Row>) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  async function saveAll() {
    await saveMenusAction({
      creates: [],
      updates: rows.map((row) => ({
        id: row.id,
        patch: {
          label: row.label,
          kind: row.kind,
          routePath: row.kind === "group" ? null : row.routePath,
          sortOrder: row.sortOrder,
          permissionCodes: row.permissionCodes,
        },
      })),
      deletes: [],
    });
  }

  return (
    <div className="space-y-4">
      <Button onClick={() => void saveAll()}>저장</Button>
      <DataGrid
        rows={rows}
        columns={[
          { key: "code", header: "코드", type: "readonly" },
          { key: "label", header: "메뉴명", type: "text", render: (row) => <EditableTextCell value={row.label} onCommit={(value) => patchRow(row.id, { label: value })} /> },
          { key: "kind", header: "유형", type: "select", render: (row) => <EditableSelectCell value={row.kind} options={[{ label: "그룹", value: "group" }, { label: "페이지", value: "page" }]} onCommit={(value) => patchRow(row.id, { kind: value as Row["kind"], routePath: value === "group" ? null : row.routePath })} /> },
          { key: "routePath", header: "경로", type: "select", render: (row) => <EditableSelectCell value={row.routePath ?? props.routeOptions[0] ?? "/dashboard"} options={props.routeOptions.map((value) => ({ label: value, value }))} onCommit={(value) => patchRow(row.id, { routePath: value })} /> },
          { key: "sortOrder", header: "정렬", type: "numeric", render: (row) => <EditableNumericCell value={row.sortOrder} onCommit={(value) => patchRow(row.id, { sortOrder: value })} /> },
        ]}
      />
    </div>
  );
}
