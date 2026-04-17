"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ProjectInquiryItem } from "@/lib/queries/projects";
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
  items: ProjectInquiryItem[];
};

const priorityVariant: Record<string, "secondary" | "warning" | "destructive"> = {
  low: "secondary",
  medium: "secondary",
  high: "warning",
  urgent: "destructive"
};

export function InquiryTable({ projectId, items }: Props) {
  const router = useRouter();
  const t = useTranslations("Projects.InquiryTable");
  const [isPending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [draftStatuses, setDraftStatuses] = React.useState<Record<string, string>>(
    {}
  );
  const [form, setForm] = React.useState({
    title: "",
    content: "",
    priority: "medium"
  });

  function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const response = await fetch(`/api/projects/${projectId}/inquiries`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(form)
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setError(payload?.error?.formErrors?.[0] ?? "Unable to create inquiry.");
        return;
      }

      setForm({
        title: "",
        content: "",
        priority: "medium"
      });
      router.refresh();
    });
  }

  function updateStatus(id: string) {
    startTransition(async () => {
      const response = await fetch(`/api/projects/${projectId}/inquiries`, {
        method: "PUT",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          id,
          status: draftStatuses[id] ?? items.find((item) => item.id === id)?.status
        })
      });

      if (!response.ok) {
        return;
      }

      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={handleCreate}
        className="rounded-2xl border border-surface-200 bg-card p-5 shadow-sm"
      >
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-surface-900">New Inquiry</h2>
          <p className="text-sm text-surface-500">Track open questions and follow-ups.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {/* eslint-disable-next-line jsx-a11y/label-has-associated-control -- label wraps custom Input component; rule cannot detect control association through custom wrappers */}
          <label className="space-y-2 md:col-span-2">
            <span className="text-sm font-medium text-surface-700">Title</span>
            <Input
              value={form.title}
              onChange={(event) =>
                setForm((current) => ({ ...current, title: event.target.value }))
              }
              placeholder="Need delivery ETA from vendor"
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-surface-700">Priority</span>
            <select
              className="flex h-10 w-full rounded-lg border border-surface-300 bg-card px-3 py-2 text-sm text-surface-900 shadow-sm focus:border-isu-500 focus:outline-none focus:ring-2 focus:ring-isu-100"
              value={form.priority}
              onChange={(event) =>
                setForm((current) => ({ ...current, priority: event.target.value }))
              }
            >
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
              <option value="urgent">urgent</option>
            </select>
          </label>

          {/* eslint-disable-next-line jsx-a11y/label-has-associated-control -- label wraps custom Textarea component; rule cannot detect control association through custom wrappers */}
          <label className="space-y-2 md:col-span-2">
            <span className="text-sm font-medium text-surface-700">Details</span>
            <Textarea
              value={form.content}
              onChange={(event) =>
                setForm((current) => ({ ...current, content: event.target.value }))
              }
              placeholder="Capture the blocker, owner, and expected answer."
            />
          </label>
        </div>

        {error ? <p className="mt-4 text-sm text-rose-600">{error}</p> : null}

        <div className="mt-4 flex justify-end">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving..." : "Create Inquiry"}
          </Button>
        </div>
      </form>

      <div className="rounded-2xl border border-surface-200 bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("columns.title")}</TableHead>
              <TableHead>{t("columns.priority")}</TableHead>
              <TableHead>{t("columns.author")}</TableHead>
              <TableHead>{t("columns.status")}</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-surface-500">
                  No inquiries yet.
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <div className="space-y-1">
                      <div className="font-medium text-surface-900">{item.title}</div>
                      {item.content ? (
                        <div className="text-sm text-surface-500">{item.content}</div>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={priorityVariant[item.priority] ?? "secondary"}>
                      {item.priority}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {item.authorName
                      ? `${item.authorName}${item.authorEmployeeId ? ` (${item.authorEmployeeId})` : ""}`
                      : "-"}
                  </TableCell>
                  <TableCell>
                    <select
                      className="flex h-10 min-w-36 rounded-lg border border-surface-300 bg-card px-3 py-2 text-sm text-surface-900 shadow-sm focus:border-isu-500 focus:outline-none focus:ring-2 focus:ring-isu-100"
                      value={draftStatuses[item.id] ?? item.status}
                      onChange={(event) =>
                        setDraftStatuses((current) => ({
                          ...current,
                          [item.id]: event.target.value
                        }))
                      }
                    >
                      <option value="open">open</option>
                      <option value="in-progress">in-progress</option>
                      <option value="resolved">resolved</option>
                      <option value="closed">closed</option>
                    </select>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => updateStatus(item.id)}
                      disabled={isPending}
                    >
                      Save
                    </Button>
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
