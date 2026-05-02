"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { savePlanViewPerformanceMonths } from "../../../actions";

type Master = {
  id: string;
  dataType: string;
  contYear: string;
  pjtCode: string;
  pjtNm: string | null;
  companyCd: string;
  companyNm: string | null;
  custNm: string | null;
  title: string | null;
  contType: string | null;
  productType: string | null;
  contSymd: string | null;
  contEymd: string | null;
  totOrderAmt: number | null;
  serOrderAmt: number | null;
  prdOrderAmt: number | null;
  infOrderAmt: number | null;
  servAmt: number | null;
  prodAmt: number | null;
  sgaAmt: number | null;
  expAmt: number | null;
};

type MonthKey =
  | "serOrderAmt" | "prdOrderAmt" | "infOrderAmt"
  | "servAmt" | "prodAmt"
  | "inManMonth" | "outManMonth"
  | "dirInAmt" | "dirOutAmt"
  | "indirOrgAmt" | "indirAllAmt"
  | "sgaAmt" | "expAmt";

type Month = { id: string; ym: string } & Record<MonthKey, number | null>;

const fmt = (v: number | null): string => (v == null ? "" : v.toLocaleString("ko-KR"));

const MONTH_COLS: Array<{ key: MonthKey; label: string }> = [
  { key: "serOrderAmt", label: "서비스 수주" },
  { key: "prdOrderAmt", label: "상품 수주" },
  { key: "infOrderAmt", label: "인프라 수주" },
  { key: "servAmt", label: "서비스 매출" },
  { key: "prodAmt", label: "상품 매출" },
  { key: "inManMonth", label: "내부 M/M" },
  { key: "outManMonth", label: "외주 M/M" },
  { key: "dirInAmt", label: "직접 내부" },
  { key: "dirOutAmt", label: "직접 외주" },
  { key: "indirOrgAmt", label: "간접 조직" },
  { key: "indirAllAmt", label: "간접 전사" },
  { key: "sgaAmt", label: "판관비" },
  { key: "expAmt", label: "기타 경비" },
];

function MasterField({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-slate-600">{label}</label>
      <div className="h-9 rounded border border-slate-200 bg-slate-50 px-3 text-sm leading-9 text-slate-700">
        {value === null || value === undefined || value === "" ? "—" : typeof value === "number" ? fmt(value) : String(value)}
      </div>
    </div>
  );
}

function parseNumeric(s: string): number | null {
  const trimmed = s.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function PlanViewPerfDetailView({ master, months }: { master: Master; months: Month[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const initial = useMemo(() => new Map(months.map((m) => [m.id, m])), [months]);
  const [draft, setDraft] = useState<Map<string, Month>>(initial);

  const dirtyIds = useMemo(() => {
    const ids: string[] = [];
    for (const [id, row] of draft.entries()) {
      const orig = initial.get(id);
      if (!orig) continue;
      const changed = MONTH_COLS.some((c) => row[c.key] !== orig[c.key]);
      if (changed) ids.push(id);
    }
    return ids;
  }, [draft, initial]);

  function patchCell(id: string, key: MonthKey, raw: string) {
    const value = parseNumeric(raw);
    setDraft((prev) => {
      const next = new Map(prev);
      const row = next.get(id);
      if (!row) return prev;
      next.set(id, { ...row, [key]: value });
      return next;
    });
  }

  function handleSave() {
    if (dirtyIds.length === 0) {
      toast({ title: "변경 사항이 없습니다." });
      return;
    }
    const rows = dirtyIds.map((id) => {
      const r = draft.get(id)!;
      return {
        id,
        ym: r.ym,
        ...Object.fromEntries(MONTH_COLS.map((c) => [c.key, r[c.key]])),
      };
    });
    startTransition(async () => {
      const result = await savePlanViewPerformanceMonths({ planId: master.id, rows });
      if (result.ok) {
        toast({ title: "저장 완료", description: `${result.updated}건 갱신` });
        router.refresh();
      } else {
        toast({ title: "저장 실패", description: result.error });
      }
    });
  }

  function handleReset() {
    setDraft(new Map(initial));
  }

  return (
    <div className="space-y-4" data-testid="pvp-detail-root">
      <div className="rounded-md border border-slate-200 bg-white p-6">
        <h3 className="mb-4 text-sm font-semibold text-slate-700">기본 정보</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <MasterField label="데이터 구분" value={master.dataType} />
          <MasterField label="계약년도" value={master.contYear} />
          <MasterField label="프로젝트 코드" value={master.pjtCode} />
          <MasterField label="프로젝트명" value={master.pjtNm} />
          <MasterField label="고객사 코드" value={master.companyCd} />
          <MasterField label="고객사명" value={master.companyNm ?? master.custNm} />
          <MasterField label="계약 시작일" value={master.contSymd} />
          <MasterField label="계약 종료일" value={master.contEymd} />
          <MasterField label="계약 유형" value={master.contType} />
          <MasterField label="제품 유형" value={master.productType} />
          <MasterField label="총 수주" value={master.totOrderAmt} />
          <MasterField label="서비스 수주" value={master.serOrderAmt} />
          <MasterField label="상품 수주" value={master.prdOrderAmt} />
          <MasterField label="인프라 수주" value={master.infOrderAmt} />
          <MasterField label="서비스 매출" value={master.servAmt} />
          <MasterField label="상품 매출" value={master.prodAmt} />
          <MasterField label="판관비" value={master.sgaAmt} />
          <MasterField label="기타 경비" value={master.expAmt} />
        </div>
      </div>

      <div className="rounded-md border border-slate-200 bg-white p-6">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">월별 상세 ({months.length}개월)</h3>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500" data-testid="pvp-month-dirty-count">{dirtyIds.length}건 변경</span>
            <Button type="button" variant="outline" size="sm" onClick={handleReset} disabled={isPending || dirtyIds.length === 0}>되돌리기</Button>
            <Button type="button" size="sm" onClick={handleSave} disabled={isPending || dirtyIds.length === 0} data-testid="pvp-month-save">
              {isPending ? "저장 중…" : `저장 (${dirtyIds.length})`}
            </Button>
          </div>
        </div>
        {months.length === 0 ? (
          <div className="text-sm text-slate-500">월별 데이터가 없습니다.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs" data-testid="pvp-detail-month-table">
              <thead>
                <tr className="bg-slate-50">
                  <th className="sticky left-0 z-10 border border-slate-200 bg-slate-50 px-2 py-2 text-left text-slate-600">년월</th>
                  {MONTH_COLS.map((c) => (
                    <th key={c.key} className="border border-slate-200 px-2 py-2 text-right text-slate-600">{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {months.map((m) => {
                  const row = draft.get(m.id) ?? m;
                  const isDirty = dirtyIds.includes(m.id);
                  return (
                    <tr key={m.id} className={isDirty ? "bg-amber-50" : "hover:bg-slate-50"}>
                      <td className="sticky left-0 border border-slate-200 bg-white px-2 py-1.5 font-medium text-slate-900">{m.ym}</td>
                      {MONTH_COLS.map((c) => (
                        <td key={c.key} className="border border-slate-200 p-0">
                          <input
                            type="text"
                            inputMode="numeric"
                            className="h-7 w-full bg-transparent px-2 text-right tabular-nums text-slate-700 outline-none focus:bg-blue-50 focus:ring-1 focus:ring-inset focus:ring-blue-500"
                            value={fmt(row[c.key])}
                            onChange={(e) => patchCell(m.id, c.key, e.target.value)}
                          />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-slate-500">셀 클릭 → 숫자 입력 (콤마 자동 무시) · 변경 행은 노란색 강조 · 저장 버튼으로 일괄 반영.</p>
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <Button variant="outline" onClick={() => router.push("/sales/plan-view-permissions")}>
          목록으로
        </Button>
      </div>
    </div>
  );
}
