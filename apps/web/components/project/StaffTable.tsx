"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ProjectStaffItem, WorkspaceUserOption } from "@/lib/queries/projects";
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

type Props = {
  projectId: string;
  items: ProjectStaffItem[];
  userOptions: WorkspaceUserOption[];
};

function formatDate(value: string | null) {
  return value ?? "-";
}

export function StaffTable({ projectId, items, userOptions }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [form, setForm] = React.useState({
    userId: "",
    role: "",
    startDate: "",
    endDate: ""
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

  function handleAssign(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const response = await fetch(`/api/projects/${projectId}/staff`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(form)
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setError(payload?.error?.formErrors?.[0] ?? "Unable to assign staff.");
        return;
      }

      setForm({
        userId: "",
        role: "",
        startDate: "",
        endDate: ""
      });
      router.refresh();
    });
  }

  function handleRemove(staffId: string) {
    startTransition(async () => {
      const response = await fetch(`/api/projects/${projectId}/staff`, {
        method: "DELETE",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ staffId })
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
        onSubmit={handleAssign}
        className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
      >
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Assign Staff</h2>
          <p className="text-sm text-gray-500">Link workspace members to this project.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-medium text-gray-700">User</span>
            <select
              className="flex h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              value={form.userId}
              onChange={(event) => updateField("userId", event.target.value)}
            >
              <option value="">Select a user</option>
              {userOptions.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name} ({user.employeeId})
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-gray-700">Role</span>
            <Input
              value={form.role}
              onChange={(event) => updateField("role", event.target.value)}
              placeholder="PM, Backend Lead, QA..."
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-gray-700">Start Date</span>
            <Input
              type="date"
              value={form.startDate}
              onChange={(event) => updateField("startDate", event.target.value)}
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-gray-700">End Date</span>
            <Input
              type="date"
              value={form.endDate}
              onChange={(event) => updateField("endDate", event.target.value)}
            />
          </label>
        </div>

        {error ? <p className="mt-4 text-sm text-rose-600">{error}</p> : null}

        <div className="mt-4 flex justify-end">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Assigning..." : "Assign"}
          </Button>
        </div>
      </form>

      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Member</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Schedule</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-gray-500">
                  No staff assigned yet.
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <div className="space-y-1">
                      <div className="font-medium text-gray-900">{item.userName}</div>
                      <div className="text-sm text-gray-500">
                        {item.employeeId}
                        {item.position ? ` · ${item.position}` : ""}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{item.role ?? "-"}</TableCell>
                  <TableCell>
                    {formatDate(item.startDate)} → {formatDate(item.endDate)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-rose-600 hover:bg-rose-50"
                      onClick={() => handleRemove(item.id)}
                      disabled={isPending}
                    >
                      Remove
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
