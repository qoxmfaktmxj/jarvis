"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StaffTable } from "@/components/add-dev/StaffTable";
import { DatePicker } from "@/components/ui/DatePicker";

type StaffRow = {
  id: string;
  userId: string | null;
  role: string | null;
  startDate: string | null;
  endDate: string | null;
};

export default function AddDevStaffPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = React.useState<StaffRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [staffStartDate, setStaffStartDate] = React.useState<string | null>(null);
  const [staffEndDate, setStaffEndDate] = React.useState<string | null>(null);

  React.useEffect(() => {
    setLoading(true);
    fetch(`/api/add-dev/${id}/staff`)
      .then((r) => r.json())
      .then((j) => setData(j.data ?? []))
      .finally(() => setLoading(false));
  }, [id]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const form = e.currentTarget;
    const raw = Object.fromEntries(new FormData(form));
    try {
      const res = await fetch(`/api/add-dev/${id}/staff`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(raw),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        setError(payload?.error?.formErrors?.[0] ?? "저장 실패");
        return;
      }
      setData((prev) => [...prev, payload.data]);
      form.reset();
      setStaffStartDate(null);
      setStaffEndDate(null);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-surface-500">
        투입인력
      </h2>

      <form
        onSubmit={onSubmit}
        className="grid gap-3 rounded-xl border border-surface-200 bg-card p-4 shadow-sm md:grid-cols-[1fr_1fr_160px_160px_auto]"
      >
        {error ? (
          <p className="col-span-full text-sm text-rose-600">{error}</p>
        ) : null}
        <Input name="userId" placeholder="사용자 UUID" />
        <Input name="role" placeholder="역할" />
        <input type="hidden" name="startDate" value={staffStartDate ?? ""} readOnly />
        <DatePicker value={staffStartDate} onChange={setStaffStartDate} placeholder="시작일" />
        <input type="hidden" name="endDate" value={staffEndDate ?? ""} readOnly />
        <DatePicker value={staffEndDate} onChange={setStaffEndDate} placeholder="종료일" />
        <Button type="submit" disabled={submitting}>
          {submitting ? "추가 중..." : "추가"}
        </Button>
      </form>

      {loading ? (
        <p className="text-sm text-surface-500">불러오는 중...</p>
      ) : (
        <StaffTable data={data} />
      )}
    </div>
  );
}
