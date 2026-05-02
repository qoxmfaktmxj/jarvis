"use client";

import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

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

type Month = {
  id: string;
  ym: string;
  serOrderAmt: number | null;
  prdOrderAmt: number | null;
  infOrderAmt: number | null;
  servAmt: number | null;
  prodAmt: number | null;
  inManMonth: number | null;
  outManMonth: number | null;
  dirInAmt: number | null;
  dirOutAmt: number | null;
  indirOrgAmt: number | null;
  indirAllAmt: number | null;
  sgaAmt: number | null;
  expAmt: number | null;
};

const fmt = (v: number | null): string => (v == null ? "" : v.toLocaleString("ko-KR"));

const MONTH_COLS: Array<{ key: keyof Omit<Month, "id" | "ym">; label: string }> = [
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

export function PlanViewPerfDetailView({ master, months }: { master: Master; months: Month[] }) {
  const router = useRouter();

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
        <h3 className="mb-4 text-sm font-semibold text-slate-700">월별 상세 ({months.length}개월)</h3>
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
                {months.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50">
                    <td className="sticky left-0 border border-slate-200 bg-white px-2 py-1.5 font-medium text-slate-900">{m.ym}</td>
                    {MONTH_COLS.map((c) => (
                      <td key={c.key} className="border border-slate-200 px-2 py-1.5 text-right tabular-nums text-slate-700">{fmt(m[c.key])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
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
