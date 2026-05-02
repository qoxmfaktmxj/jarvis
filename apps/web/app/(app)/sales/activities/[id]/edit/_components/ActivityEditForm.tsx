"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveActivities } from "@/app/(app)/sales/activities/actions";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";

type ActivityDetail = {
  id: string;
  bizActNm: string;
  opportunityId: string | null;
  customerId: string | null;
  customerName: string | null;
  actYmd: string | null;
  actTypeCode: string | null;
  accessRouteCode: string | null;
  bizStepCode: string | null;
  productTypeCode: string | null;
  actContent: string | null;
  attendeeUserId: string | null;
  attendeeUserName: string | null;
  memo: string | null;
  insDate: string | null;
};

function Field({
  label,
  value,
  onChange,
  readOnly,
  multiline,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  readOnly?: boolean;
  multiline?: boolean;
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

export function ActivityEditForm({ activity }: { activity: ActivityDetail }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [draft, setDraft] = useState({
    bizActNm: activity.bizActNm ?? "",
    actYmd: activity.actYmd ?? "",
    actTypeCode: activity.actTypeCode ?? "",
    accessRouteCode: activity.accessRouteCode ?? "",
    bizStepCode: activity.bizStepCode ?? "",
    productTypeCode: activity.productTypeCode ?? "",
    actContent: activity.actContent ?? "",
  });

  function patch<K extends keyof typeof draft>(key: K, value: string) {
    setDraft((p) => ({ ...p, [key]: value }));
  }

  function handleSave() {
    startTransition(async () => {
      const r = await saveActivities({
        creates: [],
        updates: [{
          id: activity.id,
          patch: {
            bizActNm: draft.bizActNm,
            actYmd: draft.actYmd || null,
            actTypeCode: draft.actTypeCode || null,
            accessRouteCode: draft.accessRouteCode || null,
            bizStepCode: draft.bizStepCode || null,
            productTypeCode: draft.productTypeCode || null,
            actContent: draft.actContent || null,
          },
        }],
        deletes: [],
      });
      if (r.ok) {
        toast({ title: "저장 완료" });
        router.push("/sales/activities");
      } else {
        const desc = "error" in r ? r.error : (r.errors?.[0]?.message ?? "알 수 없는 오류");
        toast({ title: "저장 실패", description: desc });
      }
    });
  }

  return (
    <div className="space-y-4 rounded-md border border-slate-200 bg-white p-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="활동명" value={draft.bizActNm} onChange={(v) => patch("bizActNm", v)} />
        <Field label="활동일(YYYY-MM-DD)" value={draft.actYmd} onChange={(v) => patch("actYmd", v)} />
        <Field label="고객사" value={activity.customerName ?? ""} readOnly />
        <Field label="참석자" value={activity.attendeeUserName ?? ""} readOnly />
        <Field label="활동 유형 코드" value={draft.actTypeCode} onChange={(v) => patch("actTypeCode", v)} />
        <Field label="접근경로 코드" value={draft.accessRouteCode} onChange={(v) => patch("accessRouteCode", v)} />
        <Field label="영업단계 코드" value={draft.bizStepCode} onChange={(v) => patch("bizStepCode", v)} />
        <Field label="제품군 코드" value={draft.productTypeCode} onChange={(v) => patch("productTypeCode", v)} />
      </div>
      <Field label="활동 내용" value={draft.actContent} onChange={(v) => patch("actContent", v)} multiline />
      <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
        <Button variant="outline" onClick={() => router.push("/sales/activities")} disabled={isPending}>
          취소
        </Button>
        <Button onClick={handleSave} disabled={isPending} data-testid="activity-edit-save">
          {isPending ? "저장 중…" : "저장"}
        </Button>
      </div>
    </div>
  );
}
