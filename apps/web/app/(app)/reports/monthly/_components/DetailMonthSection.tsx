"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { saveDetailMonth } from "../actions";
import type {
  MonthReportDetailMonthRow,
  MonthReportMasterRow,
} from "@jarvis/shared/validation/month-report";

interface Props {
  monthDetail: MonthReportDetailMonthRow | null;
  master: MonthReportMasterRow;
  ym: string;
  onSaved: (m: MonthReportDetailMonthRow) => void;
}

export function DetailMonthSection({ monthDetail, master, ym, onSaved }: Props) {
  const t = useTranslations("Reports.Monthly.month");
  const empty: MonthReportDetailMonthRow = {
    enterCd: master.enterCd,
    companyCd: master.companyCd,
    ym,
    aaCnt: null, raCnt: null, newCnt: null, cpnCnt: null,
    attr1: null, attr2: null, attr3: null, attr4: null,
    updatedAt: new Date().toISOString(),
    updatedByName: null,
  };
  const [draft, setDraft] = useState<MonthReportDetailMonthRow>(monthDetail ?? empty);
  const [saving, setSaving] = useState(false);

  // Reset draft when monthDetail or ym changes
  useEffect(() => {
    setDraft(monthDetail ?? empty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthDetail, ym, master.companyCd]);

  async function save() {
    setSaving(true);
    try {
      await saveDetailMonth({
        enterCd: draft.enterCd,
        companyCd: draft.companyCd,
        ym: draft.ym,
        aaCnt: draft.aaCnt,
        raCnt: draft.raCnt,
        newCnt: draft.newCnt,
        cpnCnt: draft.cpnCnt,
        attr1: draft.attr1,
        attr2: draft.attr2,
        attr3: draft.attr3,
        attr4: draft.attr4,
      });
      onSaved(draft);
    } finally { setSaving(false); }
  }

  return (
    <section className="rounded border border-slate-200 bg-white p-4">
      <header className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">{t("title")}</h3>
        <button
          onClick={save}
          disabled={saving}
          className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-40"
        >
          {t(saving ? "saving" : "save")}
        </button>
      </header>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {(["aaCnt", "raCnt", "newCnt", "cpnCnt"] as const).map(f => (
          <label key={f} className="flex flex-col gap-1 text-xs">
            <span className="text-slate-600">{t(f)}</span>
            <input
              type="number"
              value={draft[f] ?? ""}
              onChange={e =>
                setDraft(d => ({
                  ...d,
                  [f]: e.target.value === "" ? null : Number(e.target.value),
                }))
              }
              className="rounded border border-slate-300 px-2 py-1 text-right"
            />
          </label>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
        {(["attr1", "attr2"] as const).map(f => (
          <label key={f} className="flex flex-col gap-1 text-xs">
            <span className="text-slate-600">{t(f)}</span>
            <textarea
              rows={3}
              value={draft[f] ?? ""}
              onChange={e =>
                setDraft(d => ({
                  ...d,
                  [f]: e.target.value || null,
                }))
              }
              className="rounded border border-slate-300 px-2 py-1"
            />
          </label>
        ))}
      </div>
    </section>
  );
}
