"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { UserPlus, Users, Calendar, AlertCircle, X } from "lucide-react";
import type { ProjectStaffItem, WorkspaceUserOption } from "@/lib/queries/projects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

type Props = {
  projectId: string;
  items: ProjectStaffItem[];
  userOptions: WorkspaceUserOption[];
};

function formatDate(value: string | null) {
  return value ?? "—";
}

function initials(name: string) {
  return name.trim().slice(0, 1).toUpperCase();
}

export function StaffTable({ projectId, items, userOptions }: Props) {
  const router = useRouter();
  const t = useTranslations("Projects.StaffTable");
  const [isPending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [form, setForm] = React.useState({
    userId: "",
    role: "",
    startDate: "",
    endDate: "",
  });

  function updateField<Key extends keyof typeof form>(key: Key, value: (typeof form)[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function handleAssign(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const response = await fetch(`/api/projects/${projectId}/staff`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setError(payload?.error?.formErrors?.[0] ?? "Unable to assign staff.");
        return;
      }

      setForm({ userId: "", role: "", startDate: "", endDate: "" });
      router.refresh();
    });
  }

  function handleRemove(staffId: string) {
    startTransition(async () => {
      const response = await fetch(`/api/projects/${projectId}/staff`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ staffId }),
      });
      if (!response.ok) return;
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {/* ── Assign staff form ── */}
      <form
        onSubmit={handleAssign}
        className="overflow-hidden rounded-md border border-surface-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]"
      >
        <div className="flex items-center gap-2 border-b border-surface-200 bg-surface-50/60 px-5 py-3">
          <span className="flex h-6 w-6 items-center justify-center rounded-[5px] bg-isu-50 text-isu-600 ring-1 ring-inset ring-isu-200">
            <UserPlus className="h-3.5 w-3.5" />
          </span>
          <div>
            <h2 className="text-[13px] font-semibold text-surface-900">스태프 배정</h2>
            <p className="text-[11px] text-surface-500">
              워크스페이스 멤버를 이 프로젝트에 배정합니다.
            </p>
          </div>
        </div>

        <div className="grid gap-4 p-5 md:grid-cols-2">
          <Field label="User">
            <Select
              value={form.userId}
              onChange={(v) => updateField("userId", v)}
              options={[
                { value: "", label: t("selectUser") },
                ...userOptions.map((user) => ({
                  value: user.id,
                  label: `${user.name} (${user.employeeId})`,
                })),
              ]}
            />
          </Field>

          <Field label="Role">
            <Input
              value={form.role}
              onChange={(event) => updateField("role", event.target.value)}
              placeholder="PM, Backend Lead, QA…"
            />
          </Field>

          <Field label="Start date">
            <Input
              type="date"
              value={form.startDate}
              onChange={(event) => updateField("startDate", event.target.value)}
            />
          </Field>

          <Field label="End date">
            <Input
              type="date"
              value={form.endDate}
              onChange={(event) => updateField("endDate", event.target.value)}
            />
          </Field>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-surface-100 bg-surface-50/40 px-5 py-3">
          {error ? (
            <p className="inline-flex items-center gap-1.5 text-[12px] font-medium text-red-600">
              <AlertCircle className="h-3.5 w-3.5" />
              {error}
            </p>
          ) : (
            <p className="text-display text-[11px] text-surface-400">
              필수 항목: User
            </p>
          )}
          <Button type="submit" size="sm" disabled={isPending}>
            <UserPlus className="h-3.5 w-3.5" />
            {isPending ? "배정 중…" : "배정"}
          </Button>
        </div>
      </form>

      {/* ── Staff list ── */}
      <div className="overflow-hidden rounded-md border border-surface-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
        <Table>
          <TableHeader className="bg-surface-50/70">
            <TableRow className="border-surface-200 hover:bg-transparent">
              <TableHead className="text-display h-9 text-[11px] font-semibold uppercase tracking-[0.1em] text-surface-500">
                {t("columns.member")}
              </TableHead>
              <TableHead className="text-display h-9 text-[11px] font-semibold uppercase tracking-[0.1em] text-surface-500">
                {t("columns.role")}
              </TableHead>
              <TableHead className="text-display h-9 text-[11px] font-semibold uppercase tracking-[0.1em] text-surface-500">
                {t("columns.schedule")}
              </TableHead>
              <TableHead className="w-[60px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-14 text-center">
                  <div className="flex flex-col items-center gap-2 text-surface-500">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-50 text-surface-400 ring-1 ring-surface-200">
                      <Users className="h-4 w-4" />
                    </span>
                    <p className="text-[13px] font-medium text-surface-700">
                      아직 배정된 스태프가 없습니다.
                    </p>
                    <p className="text-[11px] text-surface-400">
                      위 폼에서 멤버를 배정해 보세요.
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => (
                <TableRow key={item.id} className="group border-surface-100 hover:bg-isu-50/40">
                  <TableCell className="py-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-isu-50 text-[12px] font-semibold text-isu-700 ring-1 ring-inset ring-isu-200">
                        {initials(item.userName)}
                      </span>
                      <div className="min-w-0">
                        <div className="truncate text-[13.5px] font-medium text-surface-900">
                          {item.userName}
                        </div>
                        <div className="text-display truncate text-[11.5px] text-surface-500">
                          <span className="font-mono tabular-nums">{item.employeeId}</span>
                          {item.position ? (
                            <>
                              <span className="mx-1.5 text-surface-300">·</span>
                              {item.position}
                            </>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {item.role ? (
                      <span className="inline-flex items-center rounded-full bg-surface-50 px-2 py-0.5 text-[11px] font-medium text-surface-700 ring-1 ring-inset ring-surface-200">
                        {item.role}
                      </span>
                    ) : (
                      <span className="text-surface-300">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="text-display inline-flex items-center gap-1.5 text-[12px] tabular-nums text-surface-700">
                      <Calendar className="h-3 w-3 text-surface-400" />
                      {formatDate(item.startDate)}
                      <span className="text-surface-300">→</span>
                      {formatDate(item.endDate)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <button
                      type="button"
                      onClick={() => handleRemove(item.id)}
                      disabled={isPending}
                      aria-label="Remove"
                      className={cn(
                        "inline-flex h-7 w-7 items-center justify-center rounded-md text-surface-400 transition-all",
                        "opacity-0 group-hover:opacity-100",
                        "hover:bg-red-50 hover:text-red-600",
                        "disabled:opacity-30",
                      )}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1.5">
      <span className="text-display text-[10px] font-semibold uppercase tracking-[0.12em] text-surface-500">
        {label}
      </span>
      {children}
    </label>
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="relative">
      <select
        className="flex h-9 w-full appearance-none rounded-md border border-surface-200 bg-white px-3 pr-8 text-[13px] text-surface-900 shadow-[0_1px_2px_rgba(15,23,42,0.02)] focus:border-isu-500 focus:outline-none focus:ring-2 focus:ring-isu-200"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <svg
        className="pointer-events-none absolute right-3 top-1/2 h-3 w-3 -translate-y-1/2 text-surface-400"
        viewBox="0 0 12 12"
        fill="none"
        aria-hidden
      >
        <path
          d="M3 5l3 3 3-3"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
