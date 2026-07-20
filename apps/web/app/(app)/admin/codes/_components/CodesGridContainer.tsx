"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DataGrid } from "@/components/grid/DataGrid";
import { EditableBooleanCell } from "@/components/grid/cells/EditableBooleanCell";
import { EditableNumericCell } from "@/components/grid/cells/EditableNumericCell";
import { EditableTextCell } from "@/components/grid/cells/EditableTextCell";
import { saveCodeGroupsAction, saveCodeItemsAction } from "../actions";

type GroupRow = { id: string; code: string; name: string; description: string | null; isActive: boolean; itemCount?: number };
type ItemRow = { id: string; groupId: string; code: string; name: string; description: string | null; sortOrder: number; isActive: boolean; metadata: Record<string, unknown> };

export function CodesGridContainer(props: { initialGroups: GroupRow[]; initialItemsByGroupId: Record<string, ItemRow[]> }) {
  const [groups, setGroups] = useState(props.initialGroups);
  const [selectedGroupId, setSelectedGroupId] = useState(props.initialGroups[0]?.id ?? "");
  const [itemsByGroupId, setItemsByGroupId] = useState(props.initialItemsByGroupId);
  const items = itemsByGroupId[selectedGroupId] ?? [];

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        <Button
          onClick={() =>
            void saveCodeGroupsAction({
              creates: [],
              updates: groups.map((group) => ({ id: group.id, patch: { name: group.name, isActive: group.isActive } })),
              deletes: [],
            })
          }
        >
          그룹 저장
        </Button>
        <DataGrid
          rows={groups}
          columns={[
            { key: "code", header: "그룹 코드", type: "readonly" },
            { key: "name", header: "그룹명", type: "text", render: (row) => <EditableTextCell value={row.name} onCommit={(value) => setGroups((current) => current.map((group) => (group.id === row.id ? { ...group, name: value } : group)))} /> },
            { key: "isActive", header: "사용 여부", type: "boolean", render: (row) => <EditableBooleanCell value={row.isActive} onCommit={(value) => setGroups((current) => current.map((group) => (group.id === row.id ? { ...group, isActive: value } : group)))} /> },
          ]}
          rowActions={(row) => (
            <Button size="sm" variant={row.id === selectedGroupId ? "default" : "secondary"} onClick={() => setSelectedGroupId(row.id)}>
              선택
            </Button>
          )}
        />
      </div>
      <div className="space-y-4">
        <Button
          onClick={() =>
            void saveCodeItemsAction({
              creates: [],
              updates: items.map((item) => ({ id: item.id, patch: { name: item.name, sortOrder: item.sortOrder, isActive: item.isActive } })),
              deletes: [],
            })
          }
        >
          항목 저장
        </Button>
        <DataGrid
          rows={items}
          columns={[
            { key: "code", header: "항목 코드", type: "readonly" },
            { key: "name", header: "항목명", type: "text", render: (row) => <EditableTextCell value={row.name} onCommit={(value) => setItemsByGroupId((current) => ({ ...current, [selectedGroupId]: (current[selectedGroupId] ?? []).map((item) => (item.id === row.id ? { ...item, name: value } : item)) }))} /> },
            { key: "sortOrder", header: "정렬", type: "numeric", render: (row) => <EditableNumericCell value={row.sortOrder} onCommit={(value) => setItemsByGroupId((current) => ({ ...current, [selectedGroupId]: (current[selectedGroupId] ?? []).map((item) => (item.id === row.id ? { ...item, sortOrder: value } : item)) }))} /> },
            { key: "isActive", header: "사용 여부", type: "boolean", render: (row) => <EditableBooleanCell value={row.isActive} onCommit={(value) => setItemsByGroupId((current) => ({ ...current, [selectedGroupId]: (current[selectedGroupId] ?? []).map((item) => (item.id === row.id ? { ...item, isActive: value } : item)) }))} /> },
          ]}
        />
      </div>
    </div>
  );
}
