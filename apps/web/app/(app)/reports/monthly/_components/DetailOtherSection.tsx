"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { saveDetailOther } from "../actions";
import type { MonthReportDetailOtherRow } from "@jarvis/shared/validation/month-report";

interface Props {
  rows: MonthReportDetailOtherRow[];
  companyCd: string;
  ym: string;
  onSaved: (rows: MonthReportDetailOtherRow[]) => void;
}

interface DraftRow {
  seq: number;
  etcBizCd: string | null;
  etcTitle: string | null;
  etcMemo: string | null;
  status: "clean" | "new" | "dirty" | "deleted";
  originalSeq?: number;
}

export function DetailOtherSection({ rows: serverRows, companyCd, ym, onSaved }: Props) {
  const t = useTranslations("Reports.Monthly.other");
  const [draft, setDraft] = useState<DraftRow[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(serverRows.map(r => ({
      seq: r.seq, etcBizCd: r.etcBizCd, etcTitle: r.etcTitle, etcMemo: r.etcMemo, status: "clean",
      originalSeq: r.seq,
    })));
  }, [serverRows]);

  function addRow() {
    const maxSeq = Math.max(0, ...draft.map(d => d.seq));
    setDraft(d => [...d, { seq: maxSeq + 1, etcBizCd: null, etcTitle: null, etcMemo: null, status: "new" }]);
  }

  function updateField(idx: number, field: "etcBizCd" | "etcTitle" | "etcMemo", value: string) {
    setDraft(d => d.map((r, i) => i === idx ? { ...r, [field]: value || null, status: r.status === "new" ? "new" : "dirty" } : r));
  }

  function markDelete(idx: number) {
    setDraft(d => d.flatMap((r, i) => {
      if (i !== idx) return [r];
      if (r.status === "new") return [];
      return [{ ...r, status: "deleted" as const }];
    }));
  }

  const dirtyCount =
    draft.filter(r => r.status === "new").length +
    draft.filter(r => r.status === "dirty").length +
    draft.filter(r => r.status === "deleted").length;

  async function save() {
    setSaving(true);
    try {
      const creates = draft.filter(r => r.status === "new").map(r => ({
        seq: r.seq, etcBizCd: r.etcBizCd, etcTitle: r.etcTitle, etcMemo: r.etcMemo,
      }));
      const updates = draft.filter(r => r.status === "dirty").map(r => ({
        seq: r.seq, etcBizCd: r.etcBizCd, etcTitle: r.etcTitle, etcMemo: r.etcMemo,
      }));
      const deletes = draft.filter(r => r.status === "deleted").map(r => r.originalSeq!);

      const result = await saveDetailOther({ companyCd, ym, creates, updates, deletes });
      if (result.ok) {
        const refreshed: MonthReportDetailOtherRow[] = draft
          .filter(r => r.status !== "deleted")
          .map(r => ({
            enterCd: serverRows[0]?.enterCd ?? "",
            companyCd, ym, seq: r.seq,
            etcBizCd: r.etcBizCd, etcTitle: r.etcTitle, etcMemo: r.etcMemo,
            updatedAt: new Date().toISOString(),
            updatedByName: null,
          }));
        onSaved(refreshed);
      }
    } finally { setSaving(false); }
  }

  return (
    <section className="rounded border border-slate-200 bg-white p-4">
      <header className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">{t("title")}</h3>
        <div className="flex gap-2">
          <button onClick={addRow} className="rounded border border-slate-300 px-3 py-1 text-xs">{t("add")}</button>
          <button
            onClick={save}
            disabled={dirtyCount === 0 || saving}
            className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-40"
          >
            {saving ? t("saving") : t("save", { count: dirtyCount })}
          </button>
        </div>
      </header>
      <table className="w-full text-xs">
        <thead className="bg-slate-50">
          <tr>
            <th className="w-20 px-2 py-1 text-left font-semibold text-slate-600">{t("etcBizCd")}</th>
            <th className="w-48 px-2 py-1 text-left font-semibold text-slate-600">{t("etcTitle")}</th>
            <th className="px-2 py-1 text-left font-semibold text-slate-600">{t("etcMemo")}</th>
            <th className="w-12 px-2 py-1"></th>
          </tr>
        </thead>
        <tbody>
          {draft.length === 0 ? (
            <tr><td colSpan={4} className="p-3 text-center text-slate-400">{t("empty")}</td></tr>
          ) : draft.map((r, i) => (
            <tr key={`${r.seq}-${i}`} className={"border-t border-slate-100 " + (r.status === "deleted" ? "line-through opacity-50" : r.status === "new" ? "bg-blue-50/40" : r.status === "dirty" ? "bg-amber-50/40" : "")}>
              <td className="px-2 py-1"><input type="text" value={r.etcBizCd ?? ""} onChange={e => updateField(i, "etcBizCd", e.target.value)} className="w-full rounded border border-slate-200 px-1 py-0.5" disabled={r.status === "deleted"} /></td>
              <td className="px-2 py-1"><input type="text" value={r.etcTitle ?? ""} onChange={e => updateField(i, "etcTitle", e.target.value)} className="w-full rounded border border-slate-200 px-1 py-0.5" disabled={r.status === "deleted"} /></td>
              <td className="px-2 py-1"><textarea rows={1} value={r.etcMemo ?? ""} onChange={e => updateField(i, "etcMemo", e.target.value)} className="w-full rounded border border-slate-200 px-1 py-0.5" disabled={r.status === "deleted"} /></td>
              <td className="px-2 py-1 text-center">
                <button onClick={() => markDelete(i)} disabled={r.status === "deleted"} className="text-rose-600 hover:underline disabled:opacity-30">{t("delete")}</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
