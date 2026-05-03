"use client";
import { useState } from "react";
import { CompanyListPanel } from "./CompanyListPanel";
import { DetailPanel } from "./DetailPanel";

export function MonthlyReportContainer() {
  const [selected, setSelected] = useState<{ companyCd: string; companyName: string } | null>(null);
  const [ym, setYm] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  return (
    <div className="flex flex-1 gap-3 overflow-hidden">
      <div className="w-72 flex-shrink-0 overflow-hidden rounded border border-slate-200 bg-white">
        <CompanyListPanel selected={selected} onSelect={setSelected} />
      </div>
      <div className="flex flex-1 flex-col overflow-hidden rounded border border-slate-200 bg-white">
        <DetailPanel selected={selected} ym={ym} onYmChange={setYm} />
      </div>
    </div>
  );
}
