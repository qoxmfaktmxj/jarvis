"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ProjectTaskItem, WorkspaceUserOption } from "@/lib/queries/projects";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  projectId: string;
  items: ProjectTaskItem[];
  assignees: WorkspaceUserOption[];
};

const priorityVariant: Record<string, "secondary" | "warning" | "destructive"> = {
  low: "secondary",
  medium: "secondary",
  high: "warning",
  urgent: "destructive"
};

function formatDate(value: string | null) {
  return value ?? "-";
}

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
    assigneeId: ""
  });

  function updateField<Key extends keyof typeof form>(
    key: Key,
    value: (typeof form)[Key]
  ) {
    setForm((current) => ({
      ...current,
      [key]: value
    }));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const response = await fetch(`/api/projects/${projectId}/tasks`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(form)
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
        assigneeId: ""
      });
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
      >
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Add Task</h2>
          <p className="text-sm text-gray-500">Capture a new task for this project.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2 md:col-span-2">
            <span className="text-sm font-medium text-gray-700">Title</span>
            <Input
              value={form.title}
              onChange={(event) => updateField("title", event.target.value)}
              placeholder="Finalize rollout checklist"
            />
          </label>

          <label className="space-y-2 md:col-span-2">
            <span className="text-sm font-medium text-gray-700">Details</span>
            <Textarea
              value={form.content}
              onChange={(event) => updateField("content", event.target.value)}
              placeholder="Optional delivery notes or acceptance criteria."
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-gray-700">Status</span>
            <select
              className="flex h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              value={form.status}
              onChange={(event) => updateField("status", event.target.value)}
            >
              <option value="todo">todo</option>
              <option value="in-progress">in-progress</option>
              <option value="review">review</option>
              <option value="done">done</option>
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-gray-700">Priority</span>
            <select
              className="flex h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              value={form.priority}
              onChange={(event) => updateField("priority", event.target.value)}
            >
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
              <option value="urgent">urgent</option>
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-gray-700">Due Date</span>
            <Input
              type="date"
              value={form.dueDate}
              onChange={(event) => updateField("dueDate", event.target.value)}
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-gray-700">Assignee</span>
            <select
              className="flex h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              value={form.assigneeId}
              onChange={(event) => updateField("assigneeId", event.target.value)}
            >
              <option value="">{t("unassigned")}</option>
              {assignees.map((assignee) => (
                <option key={assignee.id} value={assignee.id}>
                  {assignee.name} ({assignee.employeeId})
                </option>
              ))}
            </select>
          </label>
        </div>

        {error ? <p className="mt-4 text-sm text-rose-600">{error}</p> : null}

        <div className="mt-4 flex justify-end">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving..." : "Add Task"}
          </Button>
        </div>
      </form>

      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("columns.title")}</TableHead>
              <TableHead>{t("columns.status")}</TableHead>
              <TableHead>{t("columns.priority")}</TableHead>
              <TableHead>{t("columns.assignee")}</TableHead>
              <TableHead>{t("columns.dueDate")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-gray-500">
                  No tasks yet.
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <div className="space-y-1">
                      <div className="font-medium text-gray-900">{item.title}</div>
                      {item.content ? (
                        <div className="text-sm text-gray-500">{item.content}</div>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>{item.status}</TableCell>
                  <TableCell>
                    <Badge variant={priorityVariant[item.priority] ?? "secondary"}>
                      {item.priority}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {item.assigneeName
                      ? `${item.assigneeName} (${item.assigneeEmployeeId})`
                      : t("unassigned")}
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
