"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Plus,
  Calendar,
  User,
  ListChecks,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import type { ProjectTaskItem, WorkspaceUserOption } from "@/lib/queries/projects";
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
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Props = {
  projectId: string;
  items: ProjectTaskItem[];
  assignees: WorkspaceUserOption[];
};

/* ── Status & priority chips ── */

const STATUS_STYLES: Record<string, { label: string; chip: string; dot: string }> = {
  todo: {
    label: "To do",
    chip: "bg-surface-100 text-surface-700 ring-surface-300",
    dot: "bg-surface-400",
  },
  "in-progress": {
    label: "In progress",
    chip: "bg-isu-50 text-isu-700 ring-isu-500/20",
    dot: "bg-isu-500",
  },
  review: {
    label: "Review",
    chip: "bg-violet-50 text-violet-700 ring-violet-500/20",
    dot: "bg-violet-500",
  },
  done: {
    label: "Done",
    chip: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
    dot: "bg-emerald-500",
  },
};

const PRIORITY_STYLES: Record<string, { label: string; chip: string }> = {
  low: { label: "Low", chip: "bg-surface-100 text-surface-600 ring-surface-300" },
  medium: { label: "Medium", chip: "bg-isu-50 text-isu-700 ring-isu-500/20" },
  high: { label: "High", chip: "bg-amber-50 text-amber-800 ring-amber-600/25" },
  urgent: { label: "Urgent", chip: "bg-red-50 text-red-700 ring-red-600/25" },
};

function StatusChip({ value }: { value: string }) {
  const meta = STATUS_STYLES[value] ?? STATUS_STYLES.todo!;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
        meta.chip,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} aria-hidden />
      {meta.label}
    </span>
  );
}

function PriorityChip({ value }: { value: string }) {
  const meta = PRIORITY_STYLES[value] ?? PRIORITY_STYLES.medium!;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide ring-1 ring-inset",
        meta.chip,
      )}
    >
      {meta.label}
    </span>
  );
}

function formatDate(value: string | null) {
  if (!value) return <span className="text-surface-300">—</span>;
  return (
    <span className="text-display inline-flex items-center gap-1 tabular-nums text-surface-700">
      <Calendar className="h-3 w-3 text-surface-400" />
      {value}
    </span>
  );
}

/* -------------------------------------------------------------------------- */

export function TaskTable({ projectId, items, assignees }: Props) {
  const router = useRouter();
  const t = useTranslations("Projects.TaskTable");
  const [isPending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [form, setForm] = React.useState({
    title: "",
    content: "",
    status: "todo",
    priority: "medium",
    dueDate: "",
    assigneeId: "",
  });

  function updateField<Key extends keyof typeof form>(key: Key, value: (typeof form)[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const response = await fetch(`/api/projects/${projectId}/tasks`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setError(payload?.error?.formErrors?.[0] ?? "Unable to create task.");
        return;
      }

      setForm({
        title: "",
        content: "",
        status: "todo",
        priority: "medium",
        dueDate: "",
        assigneeId: "",
      });
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {/* ── Add task form ── */}
      <form
        onSubmit={handleSubmit}
        className="overflow-hidden rounded-md border border-surface-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]"
      >
        <div className="flex items-center gap-2 border-b border-surface-200 bg-surface-50/60 px-5 py-3">
          <span className="flex h-6 w-6 items-center justify-center rounded-[5px] bg-isu-50 text-isu-600 ring-1 ring-inset ring-isu-200">
            <Plus className="h-3.5 w-3.5" />
          </span>
          <div>
            <h2 className="text-[13px] font-semibold text-surface-900">새 태스크 추가</h2>
            <p className="text-[11px] text-surface-500">이 프로젝트에 할 일을 기록합니다.</p>
          </div>
        </div>

        <div className="grid gap-4 p-5 md:grid-cols-2">
          <Field label="Title" span={2}>
            <Input
              value={form.title}
              onChange={(event) => updateField("title", event.target.value)}
              placeholder="Finalize rollout checklist"
            />
          </Field>

          <Field label="Details" span={2}>
            <Textarea
              value={form.content}
              onChange={(event) => updateField("content", event.target.value)}
              placeholder="Acceptance criteria, delivery notes, links…"
            />
          </Field>

          <Field label="Status">
            <Select
              value={form.status}
              onChange={(v) => updateField("status", v)}
              options={[
                { value: "todo", label: "To do" },
                { value: "in-progress", label: "In progress" },
                { value: "review", label: "Review" },
                { value: "done", label: "Done" },
              ]}
            />
          </Field>

          <Field label="Priority">
            <Select
              value={form.priority}
              onChange={(v) => updateField("priority", v)}
              options={[
                { value: "low", label: "Low" },
                { value: "medium", label: "Medium" },
                { value: "high", label: "High" },
                { value: "urgent", label: "Urgent" },
              ]}
            />
          </Field>

          <Field label="Due date">
            <Input
              type="date"
              value={form.dueDate}
              onChange={(event) => updateField("dueDate", event.target.value)}
            />
          </Field>

          <Field label="Assignee">
            <Select
              value={form.assigneeId}
              onChange={(v) => updateField("assigneeId", v)}
              options={[
                { value: "", label: t("unassigned") },
                ...assignees.map((a) => ({
                  value: a.id,
                  label: `${a.name} (${a.employeeId})`,
                })),
              ]}
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
              필수 항목: 제목
            </p>
          )}
          <Button type="submit" size="sm" disabled={isPending}>
            {isPending ? (
              <>
                <Sparkles className="h-3.5 w-3.5 animate-pulse" />
                저장 중…
              </>
            ) : (
              <>
                <Plus className="h-3.5 w-3.5" />
                태스크 추가
              </>
            )}
          </Button>
        </div>
      </form>

      {/* ── Task list ── */}
      <div className="overflow-hidden rounded-md border border-surface-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
        <Table>
          <TableHeader className="bg-surface-50/70">
            <TableRow className="border-surface-200 hover:bg-transparent">
              <TableHead className="text-display h-9 text-[11px] font-semibold uppercase tracking-[0.1em] text-surface-500">
                {t("columns.title")}
              </TableHead>
              <TableHead className="text-display h-9 text-[11px] font-semibold uppercase tracking-[0.1em] text-surface-500">
                {t("columns.status")}
              </TableHead>
              <TableHead className="text-display h-9 text-[11px] font-semibold uppercase tracking-[0.1em] text-surface-500">
                {t("columns.priority")}
              </TableHead>
              <TableHead className="text-display h-9 text-[11px] font-semibold uppercase tracking-[0.1em] text-surface-500">
                {t("columns.assignee")}
              </TableHead>
              <TableHead className="text-display h-9 text-[11px] font-semibold uppercase tracking-[0.1em] text-surface-500">
                {t("columns.dueDate")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-14 text-center">
                  <div className="flex flex-col items-center gap-2 text-surface-500">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-50 text-surface-400 ring-1 ring-surface-200">
                      <ListChecks className="h-4 w-4" />
                    </span>
                    <p className="text-[13px] font-medium text-surface-700">
                      아직 태스크가 없습니다.
                    </p>
                    <p className="text-[11px] text-surface-400">
                      위 폼으로 첫 할 일을 기록해 보세요.
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => (
                <TableRow key={item.id} className="border-surface-100 hover:bg-isu-50/40">
                  <TableCell className="py-3">
                    <div className="space-y-0.5">
                      <div className="text-[13.5px] font-medium text-surface-900">
                        {item.title}
                      </div>
                      {item.content ? (
                        <div className="line-clamp-1 text-[12px] text-surface-500">
                          {item.content}
                        </div>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusChip value={item.status} />
                  </TableCell>
                  <TableCell>
                    <PriorityChip value={item.priority} />
                  </TableCell>
                  <TableCell>
                    {item.assigneeName ? (
                      <span className="inline-flex items-center gap-1.5 text-[12.5px] text-surface-700">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-isu-50 text-[10px] font-semibold text-isu-700 ring-1 ring-inset ring-isu-200">
                          {item.assigneeName.slice(0, 1)}
                        </span>
                        <span className="truncate">
                          {item.assigneeName}
                          <span className="text-display ml-1 text-[11px] text-surface-400">
                            {item.assigneeEmployeeId}
                          </span>
                        </span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-[12px] italic text-surface-400">
                        <User className="h-3 w-3" />
                        {t("unassigned")}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>{formatDate(item.dueDate)}</TableCell>
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

function Field({
  label,
  span,
  children,
}: {
  label: string;
  span?: 2;
  children: React.ReactNode;
}) {
  return (
    <label className={cn("space-y-1.5", span === 2 && "md:col-span-2")}>
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
