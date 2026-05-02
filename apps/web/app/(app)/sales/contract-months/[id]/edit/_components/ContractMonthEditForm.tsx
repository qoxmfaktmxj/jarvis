"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { saveContractMonths } from "@/app/(app)/sales/contract-months/actions";
import { toast } from "@/hooks/use-toast";
import type { SalesContractMonthRow } from "@jarvis/shared/validation/sales-contract";

// ---------------------------------------------------------------------------
// Field helpers (mirrors ContractEditForm pattern)
// ---------------------------------------------------------------------------

interface FieldProps {
  label: string;
  value: string;
  readOnly?: boolean;
  required?: boolean;
  type?: "text" | "numeric" | "date" | "ym";
  placeholder?: string;
  onChange?: (v: string) => void;
}

function Field({ label, value, readOnly, required, type = "text", placeholder, onChange }: FieldProps) {
  const inputMode = type === "numeric" ? "numeric" : "text";
  const maxLength = type === "date" ? 8 : type === "ym" ? 6 : undefined;
  const ph =
    placeholder ??
    (type === "date" ? "YYYYMMDD" : type === "ym" ? "YYYYMM" : undefined);

  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-gray-700">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </label>
      <input
        className={[
          "rounded border px-3 py-2 text-sm outline-none",
          readOnly
            ? "cursor-not-allowed bg-gray-100 text-gray-500"
            : "border-gray-300 bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500",
        ].join(" ")}
        value={value ?? ""}
        readOnly={readOnly}
        required={required}
        inputMode={inputMode}
        maxLength={maxLength}
        placeholder={ph}
        onChange={(e) => onChange?.(e.target.value)}
      />
    </div>
  );
}

interface TextareaFieldProps {
  label: string;
  value: string;
  readOnly?: boolean;
  onChange?: (v: string) => void;
}

function TextareaField({ label, value, readOnly, onChange }: TextareaFieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      <textarea
        className={[
          "rounded border px-3 py-2 text-sm outline-none",
          readOnly
            ? "cursor-not-allowed bg-gray-100 text-gray-500"
            : "border-gray-300 bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500",
        ].join(" ")}
        value={value ?? ""}
        readOnly={readOnly}
        rows={4}
        onChange={(e) => onChange?.(e.target.value)}
      />
    </div>
  );
}

interface BooleanFieldProps {
  label: string;
  /** Y | N | null */
  checked: string | null;
  readOnly?: boolean;
  onChange?: (v: "Y" | "N") => void;
}

/** varchar(1) Y/N field rendered as checkbox. Internally stores "Y" / "N" strings. */
function BooleanField({ label, checked, readOnly, onChange }: BooleanFieldProps) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="checkbox"
        className={[
          "h-4 w-4 rounded border-gray-300",
          readOnly ? "cursor-not-allowed opacity-60" : "cursor-pointer",
        ].join(" ")}
        checked={checked === "Y"}
        disabled={readOnly}
        onChange={(e) => onChange?.(e.target.checked ? "Y" : "N")}
      />
      <label className="text-sm font-medium text-gray-700">{label}</label>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AmountGroup — reusable PLAN/VIEW/PERF section (15 fields each)
// ---------------------------------------------------------------------------

type AmountGroupKey = "plan" | "view" | "perf";

const AMOUNT_FIELDS = [
  { suffix: "InManMonth", label: "내부 M/M", decimal: true },
  { suffix: "OutManMonth", label: "외부 M/M", decimal: true },
  { suffix: "ServSaleAmt", label: "서비스 매출", decimal: false },
  { suffix: "ProdSaleAmt", label: "상품 매출", decimal: false },
  { suffix: "InfSaleAmt", label: "인프라 매출", decimal: false },
  { suffix: "ServInCostAmt", label: "서비스 내부원가", decimal: false },
  { suffix: "ServOutCostAmt", label: "서비스 외부원가", decimal: false },
  { suffix: "ProdCostAmt", label: "상품 원가", decimal: false },
  { suffix: "InCostAmt", label: "내부 원가", decimal: false },
  { suffix: "OutCostAmt", label: "외부 원가", decimal: false },
  { suffix: "IndirectGrpAmt", label: "간접 그룹", decimal: false },
  { suffix: "IndirectComAmt", label: "간접 공통", decimal: false },
  { suffix: "RentAmt", label: "임대료", decimal: false },
  { suffix: "SgaAmt", label: "판관비", decimal: false },
  { suffix: "ExpAmt", label: "기타 비용", decimal: false },
] as const;

interface AmountGroupProps {
  prefix: AmountGroupKey;
  label: string;
  bgClass: string;
  draft: DraftState;
  patch: <K extends keyof DraftState>(key: K, value: string) => void;
}

function AmountGroup({ prefix, label, bgClass, draft, patch }: AmountGroupProps) {
  return (
    <section className={`rounded p-4 ${bgClass}`}>
      <h2 className="mb-3 text-lg font-semibold text-gray-900">{label}</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        {AMOUNT_FIELDS.map((f) => {
          const fieldKey = `${prefix}${f.suffix}` as keyof DraftState;
          return (
            <Field
              key={fieldKey}
              label={f.label}
              value={draft[fieldKey] as string}
              type="numeric"
              onChange={(v) => patch(fieldKey, v)}
            />
          );
        })}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Draft state type
// ---------------------------------------------------------------------------

interface DraftState {
  // Section 1: 메타
  ym: string;
  billTargetYn: string;
  // Section 2: 계획 (PLAN)
  planInManMonth: string;
  planOutManMonth: string;
  planServSaleAmt: string;
  planProdSaleAmt: string;
  planInfSaleAmt: string;
  planServInCostAmt: string;
  planServOutCostAmt: string;
  planProdCostAmt: string;
  planInCostAmt: string;
  planOutCostAmt: string;
  planIndirectGrpAmt: string;
  planIndirectComAmt: string;
  planRentAmt: string;
  planSgaAmt: string;
  planExpAmt: string;
  // Section 3: 전망 (VIEW)
  viewInManMonth: string;
  viewOutManMonth: string;
  viewServSaleAmt: string;
  viewProdSaleAmt: string;
  viewInfSaleAmt: string;
  viewServInCostAmt: string;
  viewServOutCostAmt: string;
  viewProdCostAmt: string;
  viewInCostAmt: string;
  viewOutCostAmt: string;
  viewIndirectGrpAmt: string;
  viewIndirectComAmt: string;
  viewRentAmt: string;
  viewSgaAmt: string;
  viewExpAmt: string;
  // Section 4: 실적 (PERF)
  perfInManMonth: string;
  perfOutManMonth: string;
  perfServSaleAmt: string;
  perfProdSaleAmt: string;
  perfInfSaleAmt: string;
  perfServInCostAmt: string;
  perfServOutCostAmt: string;
  perfProdCostAmt: string;
  perfInCostAmt: string;
  perfOutCostAmt: string;
  perfIndirectGrpAmt: string;
  perfIndirectComAmt: string;
  perfRentAmt: string;
  perfSgaAmt: string;
  perfExpAmt: string;
  // Section 5: 전표 + 마감
  taxOrderAmt: string;
  taxServAmt: string;
  rfcEndYn: string;
  note: string;
}

// Numeric keys that get converted to null when empty
const NUMERIC_KEYS: (keyof DraftState)[] = [
  "planInManMonth", "planOutManMonth",
  "planServSaleAmt", "planProdSaleAmt", "planInfSaleAmt",
  "planServInCostAmt", "planServOutCostAmt", "planProdCostAmt",
  "planInCostAmt", "planOutCostAmt",
  "planIndirectGrpAmt", "planIndirectComAmt",
  "planRentAmt", "planSgaAmt", "planExpAmt",
  "viewInManMonth", "viewOutManMonth",
  "viewServSaleAmt", "viewProdSaleAmt", "viewInfSaleAmt",
  "viewServInCostAmt", "viewServOutCostAmt", "viewProdCostAmt",
  "viewInCostAmt", "viewOutCostAmt",
  "viewIndirectGrpAmt", "viewIndirectComAmt",
  "viewRentAmt", "viewSgaAmt", "viewExpAmt",
  "perfInManMonth", "perfOutManMonth",
  "perfServSaleAmt", "perfProdSaleAmt", "perfInfSaleAmt",
  "perfServInCostAmt", "perfServOutCostAmt", "perfProdCostAmt",
  "perfInCostAmt", "perfOutCostAmt",
  "perfIndirectGrpAmt", "perfIndirectComAmt",
  "perfRentAmt", "perfSgaAmt", "perfExpAmt",
  "taxOrderAmt", "taxServAmt",
];

// ---------------------------------------------------------------------------
// Main form
// ---------------------------------------------------------------------------

interface ContractMonthEditFormProps {
  contractMonth: SalesContractMonthRow;
}

export function ContractMonthEditForm({ contractMonth }: ContractMonthEditFormProps) {
  const t = useTranslations("Sales.ContractMonths.Edit");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // ── Draft: all editable fields ──────────────────────────────────────────
  const [draft, setDraft] = useState<DraftState>({
    // Section 1: 메타
    ym: contractMonth.ym ?? "",
    billTargetYn: contractMonth.billTargetYn ?? "N",
    // Section 2: 계획 (PLAN)
    planInManMonth: contractMonth.planInManMonth ?? "",
    planOutManMonth: contractMonth.planOutManMonth ?? "",
    planServSaleAmt: contractMonth.planServSaleAmt ?? "",
    planProdSaleAmt: contractMonth.planProdSaleAmt ?? "",
    planInfSaleAmt: contractMonth.planInfSaleAmt ?? "",
    planServInCostAmt: contractMonth.planServInCostAmt ?? "",
    planServOutCostAmt: contractMonth.planServOutCostAmt ?? "",
    planProdCostAmt: contractMonth.planProdCostAmt ?? "",
    planInCostAmt: contractMonth.planInCostAmt ?? "",
    planOutCostAmt: contractMonth.planOutCostAmt ?? "",
    planIndirectGrpAmt: contractMonth.planIndirectGrpAmt ?? "",
    planIndirectComAmt: contractMonth.planIndirectComAmt ?? "",
    planRentAmt: contractMonth.planRentAmt ?? "",
    planSgaAmt: contractMonth.planSgaAmt ?? "",
    planExpAmt: contractMonth.planExpAmt ?? "",
    // Section 3: 전망 (VIEW)
    viewInManMonth: contractMonth.viewInManMonth ?? "",
    viewOutManMonth: contractMonth.viewOutManMonth ?? "",
    viewServSaleAmt: contractMonth.viewServSaleAmt ?? "",
    viewProdSaleAmt: contractMonth.viewProdSaleAmt ?? "",
    viewInfSaleAmt: contractMonth.viewInfSaleAmt ?? "",
    viewServInCostAmt: contractMonth.viewServInCostAmt ?? "",
    viewServOutCostAmt: contractMonth.viewServOutCostAmt ?? "",
    viewProdCostAmt: contractMonth.viewProdCostAmt ?? "",
    viewInCostAmt: contractMonth.viewInCostAmt ?? "",
    viewOutCostAmt: contractMonth.viewOutCostAmt ?? "",
    viewIndirectGrpAmt: contractMonth.viewIndirectGrpAmt ?? "",
    viewIndirectComAmt: contractMonth.viewIndirectComAmt ?? "",
    viewRentAmt: contractMonth.viewRentAmt ?? "",
    viewSgaAmt: contractMonth.viewSgaAmt ?? "",
    viewExpAmt: contractMonth.viewExpAmt ?? "",
    // Section 4: 실적 (PERF)
    perfInManMonth: contractMonth.perfInManMonth ?? "",
    perfOutManMonth: contractMonth.perfOutManMonth ?? "",
    perfServSaleAmt: contractMonth.perfServSaleAmt ?? "",
    perfProdSaleAmt: contractMonth.perfProdSaleAmt ?? "",
    perfInfSaleAmt: contractMonth.perfInfSaleAmt ?? "",
    perfServInCostAmt: contractMonth.perfServInCostAmt ?? "",
    perfServOutCostAmt: contractMonth.perfServOutCostAmt ?? "",
    perfProdCostAmt: contractMonth.perfProdCostAmt ?? "",
    perfInCostAmt: contractMonth.perfInCostAmt ?? "",
    perfOutCostAmt: contractMonth.perfOutCostAmt ?? "",
    perfIndirectGrpAmt: contractMonth.perfIndirectGrpAmt ?? "",
    perfIndirectComAmt: contractMonth.perfIndirectComAmt ?? "",
    perfRentAmt: contractMonth.perfRentAmt ?? "",
    perfSgaAmt: contractMonth.perfSgaAmt ?? "",
    perfExpAmt: contractMonth.perfExpAmt ?? "",
    // Section 5: 전표 + 마감
    taxOrderAmt: contractMonth.taxOrderAmt ?? "",
    taxServAmt: contractMonth.taxServAmt ?? "",
    rfcEndYn: contractMonth.rfcEndYn ?? "N",
    note: contractMonth.note ?? "",
  });

  function patch<K extends keyof DraftState>(key: K, value: string) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  // Convert empty strings to null for numeric fields before saving
  function buildPatch() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p: Record<string, any> = { ...draft };
    for (const k of NUMERIC_KEYS) {
      if (p[k] === "") p[k] = null;
    }
    return p;
  }

  function handleSave() {
    startTransition(async () => {
      const result = await saveContractMonths({
        creates: [],
        updates: [{ id: contractMonth.id, ...buildPatch() }],
        deletes: [],
      });
      if (result.ok) {
        router.push("/sales/contract-months");
      } else {
        const msg = result.errors?.[0]?.message ?? "저장 실패";
        toast({
          variant: "destructive",
          title: "저장 실패",
          description: msg,
        });
      }
    });
  }

  function handleDelete() {
    if (!confirm(t("confirmDelete"))) return;
    startTransition(async () => {
      await saveContractMonths({
        creates: [],
        updates: [],
        deletes: [contractMonth.id],
      });
      router.push("/sales/contract-months");
    });
  }

  function handleBack() {
    router.push("/sales/contract-months");
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-6">

      {/* ── Section 1: 메타 ──────────────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">메타</h2>
        <div className="grid grid-cols-2 gap-4">
          <Field
            label="계약 ID"
            value={contractMonth.contractId ?? ""}
            readOnly
          />
          <Field
            label="년월"
            value={draft.ym}
            required
            type="ym"
            onChange={(v) => patch("ym", v)}
          />
          <div className="flex items-end pb-2">
            <BooleanField
              label="청구대상여부"
              checked={draft.billTargetYn}
              onChange={(v) => patch("billTargetYn", v)}
            />
          </div>
        </div>
      </section>

      {/* ── Section 2: 계획 (PLAN) ───────────────────────────────────────── */}
      <AmountGroup
        prefix="plan"
        label="계획 (PLAN)"
        bgClass="bg-pink-50"
        draft={draft}
        patch={patch}
      />

      {/* ── Section 3: 전망 (VIEW) ───────────────────────────────────────── */}
      <AmountGroup
        prefix="view"
        label="전망 (VIEW)"
        bgClass="bg-yellow-50"
        draft={draft}
        patch={patch}
      />

      {/* ── Section 4: 실적 (PERF) ───────────────────────────────────────── */}
      <AmountGroup
        prefix="perf"
        label="실적 (PERF)"
        bgClass="bg-green-50"
        draft={draft}
        patch={patch}
      />

      {/* ── Section 5: 전표 + 마감 ──────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">전표 + 마감</h2>
        <div className="grid grid-cols-2 gap-4">
          <Field
            label="세금계산서 발주금액"
            value={draft.taxOrderAmt}
            type="numeric"
            onChange={(v) => patch("taxOrderAmt", v)}
          />
          <Field
            label="세금계산서 서비스금액"
            value={draft.taxServAmt}
            type="numeric"
            onChange={(v) => patch("taxServAmt", v)}
          />
          <div className="flex items-end pb-2">
            <BooleanField
              label="RFC 마감여부"
              checked={draft.rfcEndYn}
              onChange={(v) => patch("rfcEndYn", v)}
            />
          </div>
        </div>
        <TextareaField
          label="비고"
          value={draft.note}
          onChange={(v) => patch("note", v)}
        />
      </section>

      {/* ── Readonly footer: 레거시 + 감사 정보 ──────────────────────────── */}
      <section className="space-y-4 border-t border-gray-200 pt-4">
        <h2 className="text-base font-semibold text-gray-500">레거시 + 감사 정보</h2>
        <div className="grid grid-cols-2 gap-4">
          <Field label="레거시 계약년도" value={contractMonth.legacyContYear ?? ""} readOnly />
          <Field label="레거시 계약번호" value={contractMonth.legacyContNo ?? ""} readOnly />
          <Field label="레거시 SEQ" value={contractMonth.legacySeq != null ? String(contractMonth.legacySeq) : ""} readOnly />
          <Field label="레거시 YM" value={contractMonth.legacyYm ?? ""} readOnly />
          <Field label="생성일시" value={contractMonth.createdAt} readOnly />
          <Field label="수정일시" value={contractMonth.updatedAt ?? ""} readOnly />
          <Field label="생성자" value={contractMonth.createdBy ?? ""} readOnly />
          <Field label="수정자" value={contractMonth.updatedBy ?? ""} readOnly />
        </div>
      </section>

      {/* ── Action buttons ──────────────────────────────────────────────── */}
      <div className="flex gap-3 border-t border-gray-200 pt-4">
        <button
          type="button"
          disabled={isPending || !draft.ym.trim()}
          onClick={handleSave}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t("save")}
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={handleDelete}
          className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t("delete")}
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={handleBack}
          className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {t("back")}
        </button>
      </div>
    </div>
  );
}
