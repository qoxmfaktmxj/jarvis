"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { LeaveSummaryRow } from "@/lib/queries/contractors";
import type { LeaveRequestRow } from "@/app/(app)/contractors/leaves/actions";
import { listLeaveRequestsForContract } from "@/app/(app)/contractors/leaves/actions";
import { GridSearchForm } from "@/components/grid/GridSearchForm";
import { GridFilterField } from "@/components/grid/GridFilterField";
import { DatePicker } from "@/components/ui/DatePicker";
import { LeaveMasterGridContainer } from "./LeaveMasterGridContainer";
import { LeaveDetailGridContainer } from "./LeaveDetailGridContainer";

interface Props {
  initialSummary: LeaveSummaryRow[];
  initialQuery: { referenceDate: string; name: string };
  isAdmin: boolean;
}

export function LeavesPageClient({ initialSummary, initialQuery, isAdmin }: Props) {
  const tSearch = useTranslations("Contractors.leaves.search");
  const router = useRouter();

  const [filters, setFilters] = useState(initialQuery);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialSummary[0]?.contractId ?? null,
  );
  const [detailRows, setDetailRows] = useState<LeaveRequestRow[]>([]);
  const [pending, start] = useTransition();

  const loadDetail = useCallback(
    (id: string) => {
      start(async () => {
        const res = await listLeaveRequestsForContract({ contractId: id });
        if (res.ok) setDetailRows(res.rows);
      });
    },
    [],
  );

  // mount-once: 첫 행 detail 자동 로드
  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount-once

  const handleSelect = useCallback(
    (id: string | null) => {
      setSelectedId(id);
      if (!id) {
        setDetailRows([]);
        return;
      }
      loadDetail(id);
    },
    [loadDetail],
  );

  const reloadDetailAfterSave = useCallback(() => {
    if (selectedId) loadDetail(selectedId);
    router.refresh(); // master 요약(used/remaining) 갱신
  }, [selectedId, loadDetail, router]);

  const runSearch = useCallback(() => {
    const qs = new URLSearchParams();
    qs.set("date", filters.referenceDate);
    if (filters.name.trim()) qs.set("name", filters.name.trim());
    router.push(`/contractors/leaves?${qs.toString()}`);
  }, [filters, router]);

  const resetDetail = useCallback(() => {
    setDetailRows([]);
  }, []);

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden">
      <GridSearchForm onSearch={runSearch} onResetGrid={resetDetail}>
        <GridFilterField label={tSearch("referenceDate")}>
          <DatePicker
            value={filters.referenceDate || null}
            onChange={(v) =>
              setFilters((q) => ({ ...q, referenceDate: v ?? "" }))
            }
          />
        </GridFilterField>
        <GridFilterField label={tSearch("name")}>
          <input
            type="text"
            value={filters.name}
            onChange={(e) =>
              setFilters((q) => ({ ...q, name: e.target.value }))
            }
            className="h-8 w-full rounded-md border border-(--border-default) bg-(--bg-page) px-2 text-[13px] text-(--fg-primary) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--border-focus)"
          />
        </GridFilterField>
      </GridSearchForm>

      <div className="grid min-h-0 flex-1 grid-cols-[6fr_4fr] gap-3 overflow-hidden">
        <div className="min-h-0 overflow-hidden">
          <LeaveMasterGridContainer
            rows={initialSummary}
            selectedId={selectedId}
            onSelect={handleSelect}
          />
        </div>
        <div className="min-h-0 overflow-hidden">
          <LeaveDetailGridContainer
            contractId={selectedId}
            rows={detailRows}
            onSaved={reloadDetailAfterSave}
            disabled={!isAdmin || pending}
          />
        </div>
      </div>
    </div>
  );
}
