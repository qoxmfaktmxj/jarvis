"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { listStatsByCompany, listStatsByManager, listStatsCombined } from "../actions";
import { StatsToolbar, type ToolbarFilters } from "./StatsToolbar";
import { StatsByCompanyGrid } from "./StatsByCompanyGrid";
import { StatsByManagerGrid } from "./StatsByManagerGrid";
import { StatsCombinedGrid } from "./StatsCombinedGrid";
import { ImportIncidentsButton } from "./ImportIncidentsButton";
import type { StatsRow, StatsCombinedRow } from "@jarvis/shared/validation/service-desk";

type Tab = "company" | "manager" | "combined";

export function StatsContainer() {
  const t = useTranslations("Maintenance.Stats");
  const now = new Date();
  const initYm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;

  const [filters, setFilters] = useState<ToolbarFilters>({
    yyyymmFrom: initYm,
    yyyymmTo: initYm,
    categories: ["H008", "H028", "H030", "H010", "H027", "H038"],
    cntRatio: 50,
  });
  const [tab, setTab] = useState<Tab>("company");
  const [companyRows, setCompanyRows] = useState<StatsRow[]>([]);
  const [managerRows, setManagerRows] = useState<StatsRow[]>([]);
  const [combinedRows, setCombinedRows] = useState<StatsCombinedRow[]>([]);
  const [isPending, startTransition] = useTransition();

  function search() {
    if (filters.categories.length === 0) return;
    startTransition(async () => {
      const baseInput = { ...filters };
      if (tab === "company") {
        const res = await listStatsByCompany(baseInput);
        setCompanyRows(res.rows);
      } else if (tab === "manager") {
        const res = await listStatsByManager(baseInput);
        setManagerRows(res.rows);
      } else {
        const res = await listStatsCombined(baseInput);
        setCombinedRows(res.rows);
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <StatsToolbar value={filters} onChange={setFilters} />
        </div>
        <div className="flex items-center gap-2 pt-3">
          <button
            onClick={search}
            disabled={isPending || filters.categories.length === 0}
            className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {t(isPending ? "searching" : "search")}
          </button>
          <ImportIncidentsButton ym={filters.yyyymmTo} />
        </div>
      </div>

      <div role="tablist" className="flex gap-1 border-b border-slate-200">
        {(["company", "manager", "combined"] as const).map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={
              "border-b-2 px-3 py-1.5 text-sm font-medium " +
              (tab === k
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-slate-600")
            }
          >
            {t(`tabs.${k}`)}
          </button>
        ))}
      </div>

      {tab === "company" && <StatsByCompanyGrid rows={companyRows} />}
      {tab === "manager" && <StatsByManagerGrid rows={managerRows} />}
      {tab === "combined" && <StatsCombinedGrid rows={combinedRows} />}
    </div>
  );
}
