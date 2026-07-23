"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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

type Invite = {
  email: string;
  displayName: string;
  role: UserRow["role"];
  status: UserRow["status"];
  initialPassword: string;
};

export function UsersGridContainer(props: { initialRows: UserRow[]; total: number; currentUserId: string }) {
  const t = useTranslations("Admin.Users");
  const router = useRouter();
  const [rows, setRows] = useState(props.initialRows);
  const emptyInvite: Invite = { email: "", displayName: "", role: "READER", status: "active", initialPassword: "" };
  const [invite, setInvite] = useState<Invite>(emptyInvite);
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
    try {
      await saveUsersAction({ creates: [], updates, deletes: [] });
      setMessage(t("saved"));
      router.refresh();
    } catch {
      setMessage(t("saveFailed"));
    }
  }

  async function inviteUser() {
    const email = invite.email.trim().toLowerCase();
    const displayName = invite.displayName.trim();
    if (!email || !displayName || !/^(?=.*[A-Za-z])(?=.*\d).{12,}$/.test(invite.initialPassword)) {
      setMessage(t("invalidInvite"));
      return;
    }

    const id = crypto.randomUUID();
    try {
      await saveUsersAction({
        creates: [{ id, ...invite, email, displayName }],
        updates: [],
        deletes: [],
      });
      const now = new Date().toISOString();
      setRows((current) => [...current, { id, email, displayName, role: invite.role, status: invite.status, accountType: "human", createdAt: now, updatedAt: now }]);
      setInvite(emptyInvite);
      setMessage(t("created"));
      router.refresh();
    } catch {
      setMessage(t("createFailed"));
    }
  }

  async function deleteUser() {
    if (!deleteTarget || deleteTarget.id === props.currentUserId) return;
    try {
      await saveUsersAction({ creates: [], updates: [], deletes: [deleteTarget.id] });
      setRows((current) => current.filter((row) => row.id !== deleteTarget.id));
      setDeleteTarget(null);
      setMessage(t("deleted"));
      router.refresh();
    } catch {
      setMessage(t("deleteFailed"));
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-page)] p-4 shadow-[var(--shadow-soft)] md:grid-cols-5">
        <input type="email" aria-label={t("email")} value={invite.email} onChange={(event) => setInvite((current) => ({ ...current, email: event.target.value }))} placeholder={t("email")} className="h-10 rounded-md border border-[var(--border-default)] px-3" />
        <input aria-label={t("displayName")} value={invite.displayName} onChange={(event) => setInvite((current) => ({ ...current, displayName: event.target.value }))} placeholder={t("displayName")} className="h-10 rounded-md border border-[var(--border-default)] px-3" />
        <input type="password" aria-label={t("initialPassword")} value={invite.initialPassword} onChange={(event) => setInvite((current) => ({ ...current, initialPassword: event.target.value }))} placeholder={t("initialPassword")} className="h-10 rounded-md border border-[var(--border-default)] px-3" />
        <select aria-label={t("role")} value={invite.role} onChange={(event) => setInvite((current) => ({ ...current, role: event.target.value as UserRow["role"] }))} className="h-10 rounded-md border border-[var(--border-default)] px-3">
          <option value="ADMIN">{t("roles.ADMIN")}</option>
          <option value="EDITOR">{t("roles.EDITOR")}</option>
          <option value="READER">{t("roles.READER")}</option>
        </select>
        <Button onClick={() => void inviteUser()}>{t("create")}</Button>
      </div>
      <p className="text-xs text-[var(--fg-secondary)]">{t("passwordHint")}</p>
      <Button onClick={() => void saveAll()}>{t("save")}</Button>
      {message ? <p role="status" className="text-sm text-[var(--fg-secondary)]">{message}</p> : null}
      <DataGrid
        rows={rows.map((row) => ({ ...row, updatedAt: formatDateTimeKst(row.updatedAt) }))}
        columns={[
          { key: "email", header: t("email"), type: "readonly" },
          { key: "displayName", header: t("displayName"), type: "text", render: (row) => <EditableTextCell value={row.displayName} onCommit={(value) => patchRow(row.id, { displayName: value })} /> },
          { key: "status", header: t("status"), type: "select", render: (row) => <EditableSelectCell value={row.status} options={[{ label: t("statusLabels.active"), value: "active" }, { label: t("statusLabels.disabled"), value: "disabled" }]} onCommit={(value) => patchRow(row.id, { status: value as UserRow["status"] })} /> },
          { key: "role", header: t("role"), type: "select", render: (row) => <EditableSelectCell value={row.role} options={[{ label: t("roles.ADMIN"), value: "ADMIN" }, { label: t("roles.EDITOR"), value: "EDITOR" }, { label: t("roles.READER"), value: "READER" }]} onCommit={(value) => patchRow(row.id, { role: value as UserRow["role"] })} /> },
          { key: "updatedAt", header: t("updatedAt"), type: "readonly" },
        ]}
        rowActions={(row) => (
          <Button
            size="sm"
            variant="danger"
            disabled={row.id === props.currentUserId}
            aria-label={t("deleteUser", { email: row.email })}
            onClick={() => setDeleteTarget(row)}
          >
            {t("delete")}
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
