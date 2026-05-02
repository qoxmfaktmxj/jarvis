"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { LeaveSummaryRow } from "@/lib/queries/contractors";
import { LeaveMasterTable } from "./LeaveMasterTable";
import { LeaveDetailTable, type DetailRow } from "./LeaveDetailTable";
import { saveLeaveBatch } from "@/app/(app)/contractors/leaves/actions";
import { DatePicker } from "@/components/ui/DatePicker";

type Query = { referenceDate: string; name: string };

export function LeaveManagementPanel({
  initialSummary,
  initialQuery,
  isAdmin
}: {
  initialSummary: LeaveSummaryRow[];
  initialQuery: Query;
  isAdmin: boolean;
}) {
  const t = useTranslations("Contractors.leaves");
  const router = useRouter();
  const [query, setQuery] = useState<Query>(initialQuery);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialSummary[0]?.contractId ?? null
  );
  const [detailRows, setDetailRows] = useState<DetailRow[]>([]);
  const [tmpCounter, setTmpCounter] = useState(0);
  const [saving, setSaving] = useState(false);

  const selected = useMemo(
    () => initialSummary.find((r) => r.contractId === selectedId) ?? null,
    [initialSummary, selectedId]
  );

  function runSearch() {
    const qs = new URLSearchParams();
    qs.set("date", query.referenceDate);
    if (query.name.trim()) qs.set("name", query.name.trim());
    router.push(`/contractors/leaves?${qs.toString()}`);
  }

  function addRow() {
    if (!selected) return;
    const id = `_tmp_${tmpCounter}`;
    setTmpCounter((n) => n + 1);
    setDetailRows((prev) => [
      ...prev,
      {
        id,
        status: "active",
        type: "annual",
        appliedAt: null,
        requestStatus: "approved",
        startDate: query.referenceDate,
        endDate: query.referenceDate,
        hours: 8,
        reason: "",
        dirty: true,
        markedForCancel: false
      }
    ]);
  }

  function onRowChange(id: string, patch: Partial<DetailRow>) {
    setDetailRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch, dirty: true } : r))
    );
  }

  function onToggleCancel(id: string, next: boolean) {
    setDetailRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, markedForCancel: next } : r))
    );
  }

  async function save() {
    if (!selected) return;
    setSaving(true);
    try {
      const inserts = detailRows
        .filter((r) => r.id.startsWith("_tmp_") && !r.markedForCancel)
        .map((r) => ({
          type: r.type,
          startDate: r.startDate,
          endDate: r.endDate,
          hours: r.hours,
          reason: r.reason
        }));
      const cancels = detailRows
        .filter((r) => !r.id.startsWith("_tmp_") && r.markedForCancel)
        .map((r) => r.id);
      await saveLeaveBatch({
        contractId: selected.contractId,
        inserts,
        cancels
      });
      setDetailRows([]);
      router.refresh();
    } catch (err) {
      alert(t("detail.toast.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <header className="flex items-center gap-2">
        <label className="text-xs text-surface-600">
          {t("search.referenceDate")}
        </label>
        <DatePicker
          value={query.referenceDate || null}
          onChange={(v) =>
            setQuery((q) => ({ ...q, referenceDate: v ?? "" }))
          }
        />
        <label className="ml-2 text-xs text-surface-600">
          {t("search.name")}
        </label>
        <input
          type="text"
          value={query.name}
          onChange={(e) => setQuery((q) => ({ ...q, name: e.target.value }))}
          className="rounded border border-surface-300 px-2 py-1 text-xs"
        />
        <button
          type="button"
          onClick={runSearch}
          className="rounded bg-isu-600 px-3 py-1 text-xs font-medium text-white"
        >
          {t("search.submit")}
        </button>
      </header>
      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold text-surface-700">
          ▶ {t("master.columns.name")}
        </h3>
        <LeaveMasterTable
          rows={initialSummary}
          selectedId={selectedId}
          onSelect={(id) => {
            setSelectedId(id);
            setDetailRows([]);
          }}
        />
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold text-surface-700">
          ▶ {t("detail.columns.reason")}
        </h3>
        <LeaveDetailTable
          rows={detailRows}
          disabled={!isAdmin || saving || !selected}
          onAdd={addRow}
          onSave={() => void save()}
          onRowChange={onRowChange}
          onToggleCancel={onToggleCancel}
        />
      </div>
    </section>
  );
}
