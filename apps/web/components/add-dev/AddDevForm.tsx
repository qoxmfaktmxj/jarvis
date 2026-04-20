"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type AddDevFormValues = {
  projectId: string;
  projectName: string;
  requestYearMonth: string;
  requestSequence: string;
  requesterName: string;
  requestContent: string;
  part: string;
  status: string;
  contractNumber: string;
  contractStartMonth: string;
  contractEndMonth: string;
  contractAmount: string;
  isPaid: boolean;
  invoiceIssued: boolean;
  inspectionConfirmed: boolean;
  estimateProgress: string;
  devStartDate: string;
  devEndDate: string;
  pmId: string;
  developerId: string;
  vendorContactNote: string;
  estimatedEffort: string;
  actualEffort: string;
  attachmentFileRef: string;
  remark: string;
};

type Props = {
  mode: "create" | "edit";
  id?: string;
  defaultValues?: Partial<AddDevFormValues>;
};

function normalizeDefaults(v?: Partial<AddDevFormValues>): AddDevFormValues {
  return {
    projectId: v?.projectId ?? "",
    projectName: v?.projectName ?? "",
    requestYearMonth: v?.requestYearMonth ?? "",
    requestSequence: v?.requestSequence ?? "",
    requesterName: v?.requesterName ?? "",
    requestContent: v?.requestContent ?? "",
    part: v?.part ?? "",
    status: v?.status ?? "협의중",
    contractNumber: v?.contractNumber ?? "",
    contractStartMonth: v?.contractStartMonth ?? "",
    contractEndMonth: v?.contractEndMonth ?? "",
    contractAmount: v?.contractAmount ?? "",
    isPaid: v?.isPaid ?? false,
    invoiceIssued: v?.invoiceIssued ?? false,
    inspectionConfirmed: v?.inspectionConfirmed ?? false,
    estimateProgress: v?.estimateProgress ?? "",
    devStartDate: v?.devStartDate ?? "",
    devEndDate: v?.devEndDate ?? "",
    pmId: v?.pmId ?? "",
    developerId: v?.developerId ?? "",
    vendorContactNote: v?.vendorContactNote ?? "",
    estimatedEffort: v?.estimatedEffort ?? "",
    actualEffort: v?.actualEffort ?? "",
    attachmentFileRef: v?.attachmentFileRef ?? "",
    remark: v?.remark ?? "",
  };
}

export function AddDevForm({ mode, id, defaultValues }: Props) {
  const t = useTranslations("AdditionalDev.fields");
  const router = useRouter();
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const vals = normalizeDefaults(defaultValues);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setServerError(null);
    setIsSubmitting(true);

    const form = e.currentTarget;
    const raw = Object.fromEntries(new FormData(form));
    // coerce checkboxes
    const body = {
      ...raw,
      isPaid: raw.isPaid === "on",
      invoiceIssued: raw.invoiceIssued === "on",
      inspectionConfirmed: raw.inspectionConfirmed === "on",
    };

    try {
      const response = await fetch(
        mode === "create" ? "/api/add-dev" : `/api/add-dev/${id}`,
        {
          method: mode === "create" ? "POST" : "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      );

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const fieldErrors = payload?.error?.fieldErrors ?? {};
        const message =
          payload?.error?.formErrors?.[0] ??
          fieldErrors.projectId?.[0] ??
          payload?.error ??
          "저장 중 오류가 발생했습니다.";
        setServerError(message);
        return;
      }

      const nextId = mode === "create" ? payload?.data?.id : id;
      router.push(`/add-dev/${nextId}`);
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  }

  const selectClass =
    "flex h-10 w-full rounded-lg border border-surface-300 bg-card px-3 py-2 text-sm text-surface-900 shadow-sm focus:border-isu-500 focus:outline-none focus:ring-2 focus:ring-isu-100";

  return (
    <form onSubmit={onSubmit} className="space-y-8">
      {serverError ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {serverError}
        </div>
      ) : null}

      {/* 요청 섹션 */}
      <section className="space-y-4">
        <h3 className="text-base font-semibold text-surface-800">요청</h3>

        <div className="block space-y-2">
          <label htmlFor="projectId" className="text-sm font-medium text-surface-700">프로젝트 ID *</label>
          <Input id="projectId" name="projectId" defaultValue={vals.projectId} required placeholder="UUID" />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-medium text-surface-700">{t("requestYearMonth")}</span>
            <Input
              name="requestYearMonth"
              defaultValue={vals.requestYearMonth}
              placeholder="2026-01"
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-surface-700">{t("requestSequence")}</span>
            <Input
              name="requestSequence"
              type="number"
              defaultValue={vals.requestSequence}
              placeholder="1"
            />
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-medium text-surface-700">{t("projectName")}</span>
            <Input name="projectName" defaultValue={vals.projectName} />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-surface-700">{t("requesterName")}</span>
            <Input name="requesterName" defaultValue={vals.requesterName} />
          </label>
        </div>

        <label className="block space-y-2">
          <span className="text-sm font-medium text-surface-700">{t("requestContent")}</span>
          <Textarea name="requestContent" defaultValue={vals.requestContent} rows={3} />
        </label>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-medium text-surface-700">{t("part")}</span>
            <select name="part" defaultValue={vals.part} className={selectClass}>
              <option value="">전체 파트</option>
              <option value="Saas">Saas</option>
              <option value="외부">외부</option>
              <option value="모바일">모바일</option>
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-surface-700">{t("status")}</span>
            <select name="status" defaultValue={vals.status} className={selectClass}>
              <option value="협의중">협의중</option>
              <option value="진행중">진행중</option>
              <option value="완료">완료</option>
              <option value="보류">보류</option>
            </select>
          </label>
        </div>
      </section>

      {/* 계약 섹션 */}
      <section className="space-y-4">
        <h3 className="text-base font-semibold text-surface-800">계약</h3>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-medium text-surface-700">{t("contractNumber")}</span>
            <Input name="contractNumber" defaultValue={vals.contractNumber} />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-surface-700">{t("contractAmount")}</span>
            <Input name="contractAmount" defaultValue={vals.contractAmount} placeholder="0" />
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-medium text-surface-700">{t("contractStartMonth")}</span>
            <Input name="contractStartMonth" defaultValue={vals.contractStartMonth} placeholder="2026-01" />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-surface-700">{t("contractEndMonth")}</span>
            <Input name="contractEndMonth" defaultValue={vals.contractEndMonth} placeholder="2026-12" />
          </label>
        </div>

        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-2 text-sm text-surface-700">
            <input type="checkbox" name="isPaid" defaultChecked={vals.isPaid} />
            {t("isPaid")}
          </label>
          <label className="flex items-center gap-2 text-sm text-surface-700">
            <input type="checkbox" name="invoiceIssued" defaultChecked={vals.invoiceIssued} />
            {t("invoiceIssued")}
          </label>
          <label className="flex items-center gap-2 text-sm text-surface-700">
            <input
              type="checkbox"
              name="inspectionConfirmed"
              defaultChecked={vals.inspectionConfirmed}
            />
            {t("inspectionConfirmed")}
          </label>
        </div>

        <div className="block space-y-2">
          <label htmlFor="estimateProgress" className="text-sm font-medium text-surface-700">견적진행</label>
          <Textarea id="estimateProgress" name="estimateProgress" defaultValue={vals.estimateProgress} rows={2} />
        </div>
      </section>

      {/* 개발 섹션 */}
      <section className="space-y-4">
        <h3 className="text-base font-semibold text-surface-800">개발</h3>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-medium text-surface-700">{t("devStartDate")}</span>
            <Input type="date" name="devStartDate" defaultValue={vals.devStartDate} />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-surface-700">{t("devEndDate")}</span>
            <Input type="date" name="devEndDate" defaultValue={vals.devEndDate} />
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-medium text-surface-700">{t("pm")}</span>
            <Input name="pmId" defaultValue={vals.pmId} placeholder="PM UUID" />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-surface-700">{t("developer")}</span>
            <Input name="developerId" defaultValue={vals.developerId} placeholder="개발자 UUID" />
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-medium text-surface-700">{t("estimatedEffort")}</span>
            <Input name="estimatedEffort" defaultValue={vals.estimatedEffort} placeholder="0.00" />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-surface-700">{t("actualEffort")}</span>
            <Input name="actualEffort" defaultValue={vals.actualEffort} placeholder="0.00" />
          </label>
        </div>

        <label className="block space-y-2">
          <span className="text-sm font-medium text-surface-700">{t("vendorContactNote")}</span>
          <Textarea name="vendorContactNote" defaultValue={vals.vendorContactNote} rows={2} />
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-medium text-surface-700">{t("remark")}</span>
          <Textarea name="remark" defaultValue={vals.remark} rows={2} />
        </label>
      </section>

      <div className="flex gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "저장 중..." : mode === "create" ? "등록" : "수정"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={isSubmitting}
        >
          취소
        </Button>
      </div>
    </form>
  );
}
