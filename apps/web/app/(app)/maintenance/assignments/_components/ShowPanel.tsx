"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  listAssignmentsByUserAction,
  listUsersWithAssignmentCountsAction,
} from "../actions";
import { Input } from "@/components/ui/input";
import type { MaintenanceAssignmentRow } from "@jarvis/shared/validation/maintenance";
import { CompanyCard } from "./CompanyCard";

type UserWithCount = {
  userId: string;
  employeeId: string;
  name: string;
  companyCount: number;
};

export function ShowPanel() {
  const t = useTranslations("Maintenance.Assignments.showPanel");
  const [users, setUsers] = useState<UserWithCount[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<MaintenanceAssignmentRow[]>([]);
  const [q, setQ] = useState("");
  const [isLoadingUsers, startUsersTransition] = useTransition();
  const [isLoadingAssignments, startAssignmentsTransition] = useTransition();

  const loadUsers = useCallback(
    (search: string) => {
      startUsersTransition(async () => {
        const res = await listUsersWithAssignmentCountsAction({ q: search || undefined });
        if (res.ok) setUsers(res.rows);
      });
    },
    [],
  );

  useEffect(() => {
    loadUsers("");
  }, [loadUsers]);

  useEffect(() => {
    if (!selectedUserId) {
      setAssignments([]);
      return;
    }
    startAssignmentsTransition(async () => {
      const res = await listAssignmentsByUserAction({ userId: selectedUserId });
      if (res.ok) setAssignments(res.rows);
    });
  }, [selectedUserId]);

  return (
    <div className="grid grid-cols-[300px_1fr] gap-4">
      <aside className="space-y-2 rounded-lg border border-(--border-default) bg-(--bg-page) p-3">
        <header className="text-[12px] font-semibold uppercase tracking-wide text-(--fg-secondary)">
          {t("userListTitle")}
        </header>
        <Input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") loadUsers(q);
          }}
          placeholder={t("userSearchPlaceholder")}
          className="h-8"
        />
        <ul className="max-h-[600px] divide-y divide-(--border-default) overflow-y-auto">
          {isLoadingUsers && users.length === 0 ? (
            <li className="px-2 py-3 text-[13px] text-(--fg-secondary)">…</li>
          ) : null}
          {users.map((u) => {
            const isSelected = u.userId === selectedUserId;
            return (
              <li key={u.userId}>
                <button
                  type="button"
                  onClick={() => setSelectedUserId(u.userId)}
                  className={
                    "flex w-full items-center justify-between px-2 py-2 text-left transition-colors hover:bg-slate-50 " +
                    (isSelected ? "bg-blue-50/40" : "")
                  }
                >
                  <span className="flex flex-col">
                    <span className="text-[13px] font-medium text-(--fg-primary)">{u.name}</span>
                    <span className="text-[11px] text-(--fg-secondary)">{u.employeeId}</span>
                  </span>
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                    {t("responsibleCompanies", { count: u.companyCount })}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      <section className="space-y-3">
        {!selectedUserId ? (
          <div className="rounded-lg border border-dashed border-(--border-default) bg-(--bg-page) p-8 text-center text-[13px] text-(--fg-secondary)">
            {t("selectUserHint")}
          </div>
        ) : isLoadingAssignments ? (
          <div className="text-[13px] text-(--fg-secondary)">…</div>
        ) : assignments.length === 0 ? (
          <div className="rounded-lg border border-(--border-default) bg-(--bg-page) p-6 text-center text-[13px] text-(--fg-secondary)">
            {t("noCompanies")}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {assignments.map((a) => (
              <Link
                key={a.id}
                href={`/admin/companies?focus=${a.companyId}`}
                aria-label={t("openCompany")}
              >
                <CompanyCard assignment={a} />
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
