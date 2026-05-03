"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { getMonthReportDetail } from "../actions";
import { MasterOptionsSection } from "./MasterOptionsSection";
import { DetailMonthSection } from "./DetailMonthSection";
import { DetailOtherSection } from "./DetailOtherSection";
import { ExportPdfButton } from "./ExportPdfButton";
import type {
  MonthReportMasterRow,
  MonthReportDetailMonthRow,
  MonthReportDetailOtherRow,
} from "@jarvis/shared/validation/month-report";

interface Props {
  selected: { companyCd: string; companyName: string } | null;
  ym: string;
  onYmChange: (ym: string) => void;
}

export function DetailPanel({ selected, ym, onYmChange }: Props) {
  const t = useTranslations("Reports.Monthly.detail");
  const [master, setMaster] = useState<MonthReportMasterRow | null>(null);
  const [monthDetail, setMonthDetail] = useState<MonthReportDetailMonthRow | null>(null);
  const [otherDetail, setOtherDetail] = useState<MonthReportDetailOtherRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selected) {
      setMaster(null); setMonthDetail(null); setOtherDetail([]);
      return;
    }
    setLoading(true);
    getMonthReportDetail({ companyCd: selected.companyCd, ym })
      .then(r => {
        setMaster(r.master);
        setMonthDetail(r.monthDetail);
        setOtherDetail(r.otherDetail);
      })
      .catch(() => {
        setMaster(null); setMonthDetail(null); setOtherDetail([]);
      })
      .finally(() => setLoading(false));
  }, [selected, ym]);

  if (!selected) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-slate-500">
        {t("placeholder")}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 p-3">
        <div className="flex flex-col">
          <h2 className="text-base font-semibold text-slate-900">{selected.companyName}</h2>
          <span className="text-xs text-slate-500">{selected.companyCd}</span>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="month"
            value={`${ym.substring(0, 4)}-${ym.substring(4)}`}
            onChange={e => onYmChange(e.target.value.replace("-", ""))}
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          />
          <ExportPdfButton companyCd={selected.companyCd} ym={ym} disabled={!master} />
        </div>
      </div>
      <div className="flex-1 overflow-auto p-4">
        {loading ? (
          <p className="text-xs text-slate-500">{t("loading")}</p>
        ) : !master ? (
          <p className="text-xs text-slate-500">{t("noData")}</p>
        ) : (
          <div className="flex flex-col gap-6">
            <MasterOptionsSection master={master} onSaved={setMaster} />
            <DetailMonthSection
              monthDetail={monthDetail}
              master={master}
              ym={ym}
              onSaved={setMonthDetail}
            />
            <DetailOtherSection
              rows={otherDetail}
              companyCd={selected.companyCd}
              ym={ym}
              onSaved={setOtherDetail}
            />
          </div>
        )}
      </div>
    </div>
  );
}
