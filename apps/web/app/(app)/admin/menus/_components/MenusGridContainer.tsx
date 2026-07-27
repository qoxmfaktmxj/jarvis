"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { DataGrid } from "@/components/grid/DataGrid";
import { EditableBooleanCell } from "@/components/grid/cells/EditableBooleanCell";
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
  const t = useTranslations("Admin.Menus");
  const [rows, setRows] = useState(props.initialRows);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "failed">("idle");

  function patchRow(id: string, patch: Partial<Row>) {
    setSaveState("idle");
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  async function saveAll() {
    setSaveState("saving");
    try {
      await saveMenusAction({
        creates: [],
        updates: rows.map((row) => ({
          id: row.id,
          patch: {
            label: row.label,
            kind: row.kind,
            routePath: row.kind === "group" ? null : row.routePath,
            sortOrder: row.sortOrder,
            isVisible: row.isVisible,
            permissionCodes: row.permissionCodes,
          },
        })),
        deletes: [],
      });
      setSaveState("saved");
    } catch {
      setSaveState("failed");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button onClick={() => void saveAll()} disabled={saveState === "saving"}>
          {saveState === "saving" ? t("saving") : t("save")}
        </Button>
        <span
          role="status"
          className={`text-sm ${saveState === "failed" ? "text-red-700" : "text-[var(--fg-secondary)]"}`}
        >
          {saveState === "saved" ? t("saved") : saveState === "failed" ? t("saveFailed") : ""}
        </span>
      </div>
      <DataGrid
        rows={rows}
        columns={[
          { key: "code", header: t("columns.code"), type: "readonly" },
          { key: "label", header: t("columns.label"), type: "text", render: (row) => <EditableTextCell value={row.label} onCommit={(value) => patchRow(row.id, { label: value })} /> },
          { key: "kind", header: t("columns.kind"), type: "select", render: (row) => <EditableSelectCell value={row.kind} options={[{ label: t("kinds.group"), value: "group" }, { label: t("kinds.page"), value: "page" }]} onCommit={(value) => patchRow(row.id, { kind: value as Row["kind"], routePath: value === "group" ? null : row.routePath })} /> },
          { key: "routePath", header: t("columns.routePath"), type: "select", render: (row) => <EditableSelectCell value={row.routePath ?? props.routeOptions[0] ?? "/dashboard"} options={props.routeOptions.map((value) => ({ label: value, value }))} onCommit={(value) => patchRow(row.id, { routePath: value })} /> },
          { key: "sortOrder", header: t("columns.sortOrder"), type: "numeric", render: (row) => <EditableNumericCell value={row.sortOrder} onCommit={(value) => patchRow(row.id, { sortOrder: value })} /> },
          { key: "isVisible", header: t("columns.isVisible"), type: "boolean", render: (row) => <EditableBooleanCell value={row.isVisible} ariaLabel={`${row.label} ${t("columns.isVisible")}`} onCommit={(value) => patchRow(row.id, { isVisible: value })} /> },
        ]}
      />
    </div>
  );
}
