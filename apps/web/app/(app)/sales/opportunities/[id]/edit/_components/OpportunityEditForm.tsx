"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveOpportunities } from "@/app/(app)/sales/opportunities/actions";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";

type OpportunityDetail = {
  id: string;
  bizOpNm: string;
  customerId: string | null;
  customerName: string | null;
  productTypeCode: string | null;
  bizStepCode: string | null;
  bizStepYmd: string | null;
  saleTypeCode: string | null;
  bizTypeCode: string | null;
  industryCode: string | null;
  bizAreaCode: string | null;
  bizOpSourceCode: string | null;
  contExpecAmt: number | null;
  contExpecYmd: string | null;
  contExpecSymd: string | null;
  contExpecEymd: string | null;
  orgNm: string | null;
  focusMgrYn: boolean;
  memo: string | null;
  insUserId: string | null;
  insUserName: string | null;
  insDate: string | null;
};

function Field({
  label,
  value,
  onChange,
  readOnly,
  multiline,
  type = "text",
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  readOnly?: boolean;
  multiline?: boolean;
  type?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-slate-600">{label}</label>
      {multiline ? (
        <textarea
          className={[
            "min-h-[120px] rounded border px-3 py-2 text-sm outline-none",
            readOnly ? "cursor-not-allowed bg-slate-50 text-slate-500" : "border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500",
          ].join(" ")}
          value={value}
          readOnly={readOnly}
          onChange={(e) => onChange?.(e.target.value)}
        />
      ) : (
        <input
          type={type}
          className={[
            "h-9 rounded border px-3 text-sm outline-none",
            readOnly ? "cursor-not-allowed bg-slate-50 text-slate-500" : "border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500",
          ].join(" ")}
          value={value}
          readOnly={readOnly}
          onChange={(e) => onChange?.(e.target.value)}
        />
      )}
    </div>
  );
}

export function OpportunityEditForm({ opportunity }: { opportunity: OpportunityDetail }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [draft, setDraft] = useState({
    bizOpNm: opportunity.bizOpNm ?? "",
    productTypeCode: opportunity.productTypeCode ?? "",
    bizStepCode: opportunity.bizStepCode ?? "",
    bizStepYmd: opportunity.bizStepYmd ?? "",
    bizOpSourceCode: opportunity.bizOpSourceCode ?? "",
    orgNm: opportunity.orgNm ?? "",
    focusMgrYn: opportunity.focusMgrYn,
  });

  function patch<K extends keyof typeof draft>(key: K, value: typeof draft[K]) {
    setDraft((p) => ({ ...p, [key]: value }));
  }

  function handleSave() {
    startTransition(async () => {
      const r = await saveOpportunities({
        creates: [],
        updates: [{
          id: opportunity.id,
          patch: {
            bizOpNm: draft.bizOpNm,
            productTypeCode: draft.productTypeCode || null,
            bizStepCode: draft.bizStepCode || null,
            bizStepYmd: draft.bizStepYmd || null,
            bizOpSourceCode: draft.bizOpSourceCode || null,
            orgNm: draft.orgNm || null,
            focusMgrYn: draft.focusMgrYn,
          },
        }],
        deletes: [],
      });
      if (r.ok) {
        toast({ title: "저장 완료" });
        router.push("/sales/opportunities");
      } else {
        const desc = "error" in r ? r.error : (r.errors?.[0]?.message ?? "알 수 없는 오류");
        toast({ title: "저장 실패", description: desc });
      }
    });
  }

  return (
    <div className="space-y-4 rounded-md border border-slate-200 bg-white p-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="영업기회명" value={draft.bizOpNm} onChange={(v) => patch("bizOpNm", v)} />
        <Field label="조직" value={draft.orgNm} onChange={(v) => patch("orgNm", v)} />
        <Field label="고객사" value={opportunity.customerName ?? ""} readOnly />
        <Field label="등록자" value={opportunity.insUserName ?? ""} readOnly />
        <Field label="제품군 코드" value={draft.productTypeCode} onChange={(v) => patch("productTypeCode", v)} />
        <Field label="영업단계 코드" value={draft.bizStepCode} onChange={(v) => patch("bizStepCode", v)} />
        <Field label="단계 일자(YYYY-MM-DD)" value={draft.bizStepYmd} onChange={(v) => patch("bizStepYmd", v)} />
        <Field label="기회출처 코드" value={draft.bizOpSourceCode} onChange={(v) => patch("bizOpSourceCode", v)} />
        <Field label="계약예상금액" value={String(opportunity.contExpecAmt ?? "")} readOnly />
        <Field label="계약예상년월" value={opportunity.contExpecYmd ?? ""} readOnly />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={draft.focusMgrYn} onChange={(e) => patch("focusMgrYn", e.target.checked)} />
        집중관리 대상
      </label>
      <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
        <Button variant="outline" onClick={() => router.push("/sales/opportunities")} disabled={isPending}>
          취소
        </Button>
        <Button onClick={handleSave} disabled={isPending} data-testid="opportunity-edit-save">
          {isPending ? "저장 중…" : "저장"}
        </Button>
      </div>
    </div>
  );
}
