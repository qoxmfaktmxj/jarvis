"use client";
import { useTranslations } from "next-intl";
import type { StatsCombinedRow } from "@jarvis/shared/validation/service-desk";

export function StatsCombinedGrid({ rows }: { rows: StatsCombinedRow[] }) {
  const t = useTranslations("Maintenance.Stats.columns");
  return (
    <div className="overflow-auto rounded border border-slate-200">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-slate-50">
          <tr>
            <th className="px-2 py-1.5 text-left font-semibold uppercase tracking-wide text-slate-600">
              {t("managerName")}
            </th>
            <th className="px-2 py-1.5 text-left font-semibold uppercase tracking-wide text-slate-600">
              {t("companyName")}
            </th>
            <th className="w-20 px-2 py-1.5 text-right font-semibold uppercase tracking-wide text-slate-600">
              {t("cnt")}
            </th>
            <th className="w-24 px-2 py-1.5 text-right font-semibold uppercase tracking-wide text-slate-600">
              {t("workTime")}
            </th>
            <th className="w-24 px-2 py-1.5 text-right font-semibold uppercase tracking-wide text-slate-600">
              {t("total")}
            </th>
            <th className="w-24 px-2 py-1.5 text-right font-semibold uppercase tracking-wide text-slate-600">
              {t("finalRank")}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={6} className="p-3 text-center text-slate-400">
                {t("empty")}
              </td>
            </tr>
          ) : (
            rows.map((r, i) => (
              <tr
                key={`${r.managerNm ?? ""}-${r.requestCompanyNm ?? "T"}-${i}`}
                className={
                  "border-t border-slate-100 hover:bg-slate-50 " +
                  (r.requestCompanyNm === null ? "bg-slate-50 font-semibold" : "")
                }
              >
                <td className="px-2 py-1 text-slate-900">{r.managerNm ?? "-"}</td>
                <td className="px-2 py-1 text-slate-700">
                  {r.requestCompanyNm ?? (
                    <span className="italic text-slate-400">{t("subtotal")}</span>
                  )}
                </td>
                <td className="px-2 py-1 text-right">{r.cnt}</td>
                <td className="px-2 py-1 text-right">{r.workTime.toFixed(0)}</td>
                <td className="px-2 py-1 text-right">{r.total.toFixed(2)}</td>
                <td
                  className={
                    "px-2 py-1 text-right " +
                    (r.finalRank <= 3 ? "bg-rose-100 font-semibold text-rose-700" : "")
                  }
                >
                  {r.finalRank}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
