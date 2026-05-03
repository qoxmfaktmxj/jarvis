"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { listMonthReportMasters } from "../actions";
import type { MonthReportMasterRow } from "@jarvis/shared/validation/month-report";

interface Props {
  selected: { companyCd: string; companyName: string } | null;
  onSelect: (s: { companyCd: string; companyName: string }) => void;
}

export function CompanyListPanel({ selected, onSelect }: Props) {
  const t = useTranslations("Reports.Monthly.list");
  const [rows, setRows] = useState<MonthReportMasterRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    listMonthReportMasters({ companyNameLike: search || undefined })
      .then(r => setRows(r.rows))
      .finally(() => setLoading(false));
  }, [search]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col gap-2 border-b border-slate-200 p-2">
        <input
          type="search"
          placeholder={t("searchPlaceholder")}
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="rounded border border-slate-300 px-2 py-1 text-sm"
        />
      </div>
      <div className="flex-1 overflow-auto">
        {loading ? (
          <p className="p-3 text-xs text-slate-500">{t("loading")}</p>
        ) : rows.length === 0 ? (
          <p className="p-3 text-xs text-slate-500">{t("empty")}</p>
        ) : (
          <ul role="listbox">
            {rows.map(r => {
              const enabledCount = [
                r.signatureYn, r.userCntYn, r.cpnCntYn, r.workTypeYn, r.treatTypeYn,
                r.solvedYn, r.unsolvedYn, r.chargerYn, r.infraYn, r.replyYn,
              ].filter(v => v === "Y").length;
              const isSelected = selected?.companyCd === r.companyCd;
              return (
                <li
                  key={`${r.enterCd}-${r.companyCd}`}
                  role="option"
                  aria-selected={isSelected}
                  tabIndex={0}
                  onClick={() => onSelect({ companyCd: r.companyCd, companyName: r.companyName })}
                  onKeyDown={e => { if (e.key === "Enter" || e.key === " ") onSelect({ companyCd: r.companyCd, companyName: r.companyName }); }}
                  className={
                    "flex cursor-pointer flex-col gap-0.5 border-b border-slate-100 p-2.5 text-sm hover:bg-slate-50 " +
                    (isSelected ? "bg-blue-50" : "")
                  }
                >
                  <span className="font-medium text-slate-900">{r.companyName}</span>
                  <span className="text-xs text-slate-500">
                    {r.companyCd} · {t("optionsBadge", { count: enabledCount })}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
