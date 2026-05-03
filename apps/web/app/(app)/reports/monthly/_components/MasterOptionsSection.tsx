"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { saveMaster } from "../actions";
import type { MonthReportMasterRow } from "@jarvis/shared/validation/month-report";

const YN_FIELDS = [
  "signatureYn", "userCntYn", "cpnCntYn", "workTypeYn", "treatTypeYn",
  "solvedYn", "unsolvedYn", "chargerYn", "infraYn", "replyYn",
] as const;

interface Props {
  master: MonthReportMasterRow;
  onSaved: (m: MonthReportMasterRow) => void;
}

export function MasterOptionsSection({ master, onSaved }: Props) {
  const t = useTranslations("Reports.Monthly.master");
  const [draft, setDraft] = useState<MonthReportMasterRow>(master);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(master);

  function toggle(field: typeof YN_FIELDS[number]) {
    setDraft(d => ({ ...d, [field]: d[field] === "Y" ? "N" : "Y" }));
  }

  async function save() {
    setSaving(true);
    try {
      await saveMaster({
        enterCd: draft.enterCd,
        companyCd: draft.companyCd,
        signatureYn: draft.signatureYn, userCntYn: draft.userCntYn, cpnCntYn: draft.cpnCntYn,
        workTypeYn: draft.workTypeYn, treatTypeYn: draft.treatTypeYn, solvedYn: draft.solvedYn,
        unsolvedYn: draft.unsolvedYn, chargerYn: draft.chargerYn, infraYn: draft.infraYn, replyYn: draft.replyYn,
        chargerSabun1: draft.chargerSabun1, chargerSabun2: draft.chargerSabun2, senderSabun: draft.senderSabun,
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
          disabled={!dirty || saving}
          className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40"
        >
          {t(saving ? "saving" : "save")}
        </button>
      </header>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
        {YN_FIELDS.map(f => (
          <label key={f} className="flex items-center gap-1.5 text-xs">
            <input type="checkbox" checked={draft[f] === "Y"} onChange={() => toggle(f)} />
            <span>{t(f)}</span>
          </label>
        ))}
      </div>
    </section>
  );
}
