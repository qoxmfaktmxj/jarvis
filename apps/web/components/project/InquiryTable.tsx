"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  MessageSquarePlus,
  MessagesSquare,
  User,
  AlertCircle,
  Save,
} from "lucide-react";
import type { ProjectInquiryItem } from "@/lib/queries/projects";
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
  items: ProjectInquiryItem[];
};

/* ── Priority & status chips ── */

const PRIORITY_STYLES: Record<string, { label: string; chip: string }> = {
  low: { label: "Low", chip: "bg-surface-100 text-surface-600 ring-surface-300" },
  medium: { label: "Medium", chip: "bg-isu-50 text-isu-700 ring-isu-500/20" },
  high: { label: "High", chip: "bg-amber-50 text-amber-800 ring-amber-600/25" },
  urgent: { label: "Urgent", chip: "bg-red-50 text-red-700 ring-red-600/25" },
};

const STATUS_STYLES: Record<string, { label: string; chip: string; dot: string }> = {
  open: {
    label: "Open",
    chip: "bg-isu-50 text-isu-700 ring-isu-500/20",
    dot: "bg-isu-500",
  },
  "in-progress": {
    label: "In progress",
    chip: "bg-violet-50 text-violet-700 ring-violet-500/20",
    dot: "bg-violet-500",
  },
  resolved: {
    label: "Resolved",
    chip: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
    dot: "bg-emerald-500",
  },
  closed: {
    label: "Closed",
    chip: "bg-surface-100 text-surface-600 ring-surface-300",
    dot: "bg-surface-400",
  },
};

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

function StatusChip({ value }: { value: string }) {
  const meta = STATUS_STYLES[value] ?? STATUS_STYLES.open!;
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

/* -------------------------------------------------------------------------- */

export function InquiryTable({ projectId, items }: Props) {
  const router = useRouter();
  const t = useTranslations("Projects.InquiryTable");
  const [isPending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [draftStatuses, setDraftStatuses] = React.useState<Record<string, string>>({});
  const [form, setForm] = React.useState({
    title: "",
    content: "",
    priority: "medium",
  });

  function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const response = await fetch(`/api/projects/${projectId}/inquiries`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setError(payload?.error?.formErrors?.[0] ?? "Unable to create inquiry.");
        return;
      }

      setForm({ title: "", content: "", priority: "medium" });
      router.refresh();
    });
  }

  function updateStatus(id: string) {
    startTransition(async () => {
      const response = await fetch(`/api/projects/${projectId}/inquiries`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id,
          status:
            draftStatuses[id] ?? items.find((item) => item.id === id)?.status,
        }),
      });
      if (!response.ok) return;
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {/* ── New inquiry form ── */}
      <form
        onSubmit={handleCreate}
        className="overflow-hidden rounded-md border border-surface-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]"
      >
        <div className="flex items-center gap-2 border-b border-surface-200 bg-surface-50/60 px-5 py-3">
          <span className="flex h-6 w-6 items-center justify-center rounded-[5px] bg-isu-50 text-isu-600 ring-1 ring-inset ring-isu-200">
            <MessageSquarePlus className="h-3.5 w-3.5" />
          </span>
          <div>
            <h2 className="text-[13px] font-semibold text-surface-900">새 문의</h2>
            <p className="text-[11px] text-surface-500">
              미결 질문과 후속 조치를 기록합니다.
            </p>
          </div>
        </div>

        <div className="grid gap-4 p-5 md:grid-cols-2">
          <Field label="Title" span={2}>
            <Input
              value={form.title}
              onChange={(event) =>
                setForm((current) => ({ ...current, title: event.target.value }))
              }
              placeholder="Need delivery ETA from vendor"
            />
          </Field>

          <Field label="Priority">
            <Select
              value={form.priority}
              onChange={(v) =>
                setForm((current) => ({ ...current, priority: v }))
              }
              options={[
                { value: "low", label: "Low" },
                { value: "medium", label: "Medium" },
                { value: "high", label: "High" },
                { value: "urgent", label: "Urgent" },
              ]}
            />
          </Field>

          <Field label="Details" span={2}>
            <Textarea
              value={form.content}
              onChange={(event) =>
                setForm((current) => ({ ...current, content: event.target.value }))
              }
              placeholder="Capture the blocker, owner, and expected answer."
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
            <MessageSquarePlus className="h-3.5 w-3.5" />
            {isPending ? "저장 중…" : "문의 등록"}
          </Button>
        </div>
      </form>

      {/* ── Inquiry list ── */}
      <div className="overflow-hidden rounded-md border border-surface-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
        <Table>
          <TableHeader className="bg-surface-50/70">
            <TableRow className="border-surface-200 hover:bg-transparent">
              <TableHead className="text-display h-9 text-[11px] font-semibold uppercase tracking-[0.1em] text-surface-500">
                {t("columns.title")}
              </TableHead>
              <TableHead className="text-display h-9 text-[11px] font-semibold uppercase tracking-[0.1em] text-surface-500">
                {t("columns.priority")}
              </TableHead>
              <TableHead className="text-display h-9 text-[11px] font-semibold uppercase tracking-[0.1em] text-surface-500">
                {t("columns.author")}
              </TableHead>
              <TableHead className="text-display h-9 text-[11px] font-semibold uppercase tracking-[0.1em] text-surface-500">
                {t("columns.status")}
              </TableHead>
              <TableHead className="w-[72px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-14 text-center">
                  <div className="flex flex-col items-center gap-2 text-surface-500">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-50 text-surface-400 ring-1 ring-surface-200">
                      <MessagesSquare className="h-4 w-4" />
                    </span>
                    <p className="text-[13px] font-medium text-surface-700">
                      등록된 문의가 없습니다.
                    </p>
                    <p className="text-[11px] text-surface-400">
                      위 폼에서 첫 번째 문의를 남겨보세요.
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => {
                const draft = draftStatuses[item.id] ?? item.status;
                const dirty = draft !== item.status;
                return (
                  <TableRow
                    key={item.id}
                    className="border-surface-100 hover:bg-isu-50/40"
                  >
                    <TableCell className="py-3">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <StatusChip value={item.status} />
                          <div className="text-[13.5px] font-medium text-surface-900">
                            {item.title}
                          </div>
                        </div>
                        {item.content ? (
                          <div className="line-clamp-1 pl-[76px] text-[12px] text-surface-500">
                            {item.content}
                          </div>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <PriorityChip value={item.priority} />
                    </TableCell>
                    <TableCell>
                      {item.authorName ? (
                        <span className="inline-flex items-center gap-1.5 text-[12.5px] text-surface-700">
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-isu-50 text-[10px] font-semibold text-isu-700 ring-1 ring-inset ring-isu-200">
                            {item.authorName.slice(0, 1)}
                          </span>
                          <span className="truncate">
                            {item.authorName}
                            {item.authorEmployeeId ? (
                              <span className="text-display ml-1 text-[11px] text-surface-400">
                                {item.authorEmployeeId}
                              </span>
                            ) : null}
                          </span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-[12px] italic text-surface-400">
                          <User className="h-3 w-3" />—
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={draft}
                        onChange={(v) =>
                          setDraftStatuses((current) => ({
                            ...current,
                            [item.id]: v,
                          }))
                        }
                        options={[
                          { value: "open", label: "Open" },
                          { value: "in-progress", label: "In progress" },
                          { value: "resolved", label: "Resolved" },
                          { value: "closed", label: "Closed" },
                        ]}
                        compact
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => updateStatus(item.id)}
                        disabled={isPending || !dirty}
                        className={cn(
                          "h-7 gap-1 px-2 text-[11.5px]",
                          dirty
                            ? "text-isu-700 hover:bg-isu-50"
                            : "text-surface-400",
                        )}
                      >
                        <Save className="h-3 w-3" />
                        저장
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
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
  compact,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  compact?: boolean;
}) {
  return (
    <div className="relative">
      <select
        className={cn(
          "flex w-full appearance-none rounded-md border border-surface-200 bg-white px-3 pr-8 text-surface-900 shadow-[0_1px_2px_rgba(15,23,42,0.02)] focus:border-isu-500 focus:outline-none focus:ring-2 focus:ring-isu-200",
          compact ? "h-8 min-w-[130px] text-[12px]" : "h-9 text-[13px]",
        )}
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
