"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DataGrid } from "@/components/grid/DataGrid";
import { EditableSelectCell } from "@/components/grid/cells/EditableSelectCell";
import { EditableTextCell } from "@/components/grid/cells/EditableTextCell";
import { formatDateTimeKst } from "@/lib/format-date-time";
import { ConfirmDeleteDialog } from "../../_components/ConfirmDeleteDialog";
import { saveUsersAction } from "../actions";

type UserRow = {
  id: string;
  email: string;
  displayName: string;
  status: "active" | "disabled";
  role: "ADMIN" | "EDITOR" | "READER";
  accountType: "human" | "demo";
  createdAt: string;
  updatedAt: string;
};

export function UsersGridContainer(props: { initialRows: UserRow[]; total: number; currentUserId: string }) {
  const [rows, setRows] = useState(props.initialRows);
  const [invite, setInvite] = useState({ email: "", displayName: "", role: "READER", status: "active", initialPassword: "" });
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function patchRow(id: string, patch: Partial<UserRow>) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  async function saveAll() {
    const updates = rows.map((row) => ({
      id: row.id,
      patch: { displayName: row.displayName, status: row.status, role: row.role },
    }));
    await saveUsersAction({ creates: [], updates, deletes: [] });
    setMessage("저장되었습니다.");
  }

  async function inviteUser() {
    await saveUsersAction({
      creates: [{ id: crypto.randomUUID(), ...invite }],
      updates: [],
      deletes: [],
    });
    setMessage("사용자를 추가했습니다.");
  }

  async function deleteUser() {
    if (!deleteTarget || deleteTarget.id === props.currentUserId) return;
    await saveUsersAction({ creates: [], updates: [], deletes: [deleteTarget.id] });
    setRows((current) => current.filter((row) => row.id !== deleteTarget.id));
    setDeleteTarget(null);
    setMessage("사용자를 삭제했습니다.");
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-page)] p-4 shadow-[var(--shadow-soft)] md:grid-cols-5">
        <input value={invite.email} onChange={(event) => setInvite((current) => ({ ...current, email: event.target.value }))} placeholder="email" className="h-10 rounded-md border border-[var(--border-default)] px-3" />
        <input value={invite.displayName} onChange={(event) => setInvite((current) => ({ ...current, displayName: event.target.value }))} placeholder="displayName" className="h-10 rounded-md border border-[var(--border-default)] px-3" />
        <input value={invite.initialPassword} onChange={(event) => setInvite((current) => ({ ...current, initialPassword: event.target.value }))} placeholder="initial password" className="h-10 rounded-md border border-[var(--border-default)] px-3" />
        <select value={invite.role} onChange={(event) => setInvite((current) => ({ ...current, role: event.target.value }))} className="h-10 rounded-md border border-[var(--border-default)] px-3">
          <option value="ADMIN">관리자</option>
          <option value="EDITOR">편집자</option>
          <option value="READER">열람자</option>
        </select>
        <Button onClick={() => void inviteUser()}>사용자 추가</Button>
      </div>
      <Button onClick={() => void saveAll()}>저장</Button>
      {message ? <p role="status" className="text-sm text-[var(--fg-secondary)]">{message}</p> : null}
      <DataGrid
        rows={rows.map((row) => ({ ...row, updatedAt: formatDateTimeKst(row.updatedAt) }))}
        columns={[
          { key: "email", header: "이메일", type: "readonly" },
          { key: "displayName", header: "이름", type: "text", render: (row) => <EditableTextCell value={row.displayName} onCommit={(value) => patchRow(row.id, { displayName: value })} /> },
          { key: "status", header: "상태", type: "select", render: (row) => <EditableSelectCell value={row.status} options={[{ label: "활성", value: "active" }, { label: "비활성", value: "disabled" }]} onCommit={(value) => patchRow(row.id, { status: value as UserRow["status"] })} /> },
          { key: "role", header: "역할", type: "select", render: (row) => <EditableSelectCell value={row.role} options={[{ label: "관리자", value: "ADMIN" }, { label: "편집자", value: "EDITOR" }, { label: "열람자", value: "READER" }]} onCommit={(value) => patchRow(row.id, { role: value as UserRow["role"] })} /> },
          { key: "updatedAt", header: "수정 시각", type: "readonly" },
        ]}
        rowActions={(row) => (
          <Button
            size="sm"
            variant="danger"
            disabled={row.id === props.currentUserId}
            aria-label={`${row.email} 삭제`}
            onClick={() => setDeleteTarget(row)}
          >
            삭제
          </Button>
        )}
      />
      <ConfirmDeleteDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        onConfirm={() => void deleteUser()}
      />
    </div>
  );
}
