"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { saveContracts } from "@/app/(app)/sales/contracts/actions";
import { toast } from "@/hooks/use-toast";
import type { SalesContractRow } from "@jarvis/shared/validation/sales-contract";

// ---------------------------------------------------------------------------
// Field helpers
// ---------------------------------------------------------------------------

interface FieldProps {
  label: string;
  value: string;
  readOnly?: boolean;
  required?: boolean;
  type?: "text" | "numeric" | "date";
  placeholder?: string;
  onChange?: (v: string) => void;
}

function Field({ label, value, readOnly, required, type = "text", placeholder, onChange }: FieldProps) {
  const inputMode = type === "numeric" ? "numeric" : "text";
  const maxLength = type === "date" ? 8 : undefined;
  const ph = placeholder ?? (type === "date" ? "YYYYMMDD" : undefined);

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
// Main form
// ---------------------------------------------------------------------------

interface ContractEditFormProps {
  contract: SalesContractRow;
}

export function ContractEditForm({ contract }: ContractEditFormProps) {
  const t = useTranslations("Sales.Contracts.Edit");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // ── Draft: all editable fields ──────────────────────────────────────────
  const [draft, setDraft] = useState({
    // Section 1: 계약 기본 (9 fields)
    contNm: contract.contNm ?? "",
    contGbCd: contract.contGbCd ?? "",
    // TODO: contGbCd — future enhancement: load code-group options (코드그룹 팝업)
    mainContType: contract.mainContType ?? "",
    contYmd: contract.contYmd ?? "",
    contSymd: contract.contSymd ?? "",
    contEymd: contract.contEymd ?? "",
    newYn: contract.newYn ?? "N",
    inOutType: contract.inOutType ?? "",
    contInitYn: contract.contInitYn ?? "N",

    // Section 2: 회사·거래처 (7 editable; companyCd readonly)
    companyType: contract.companyType ?? "",
    companyGrpNm: contract.companyGrpNm ?? "",
    companyNm: contract.companyNm ?? "",
    companyNo: contract.companyNo ?? "",
    companyAddr: contract.companyAddr ?? "",
    companyOner: contract.companyOner ?? "",
    custNm: contract.custNm ?? "",

    // Section 3: 담당자·기타 (3 editable)
    customerNo: contract.customerNo ?? "",
    customerEmail: contract.customerEmail ?? "",
    sucProb: contract.sucProb ?? "",

    // Section 4: 계약 금액 (14 editable)
    startAmt: contract.startAmt ?? "",
    startAmtRate: contract.startAmtRate ?? "",
    interimAmt1: contract.interimAmt1 ?? "",
    interimAmtRate1: contract.interimAmtRate1 ?? "",
    interimAmt2: contract.interimAmt2 ?? "",
    interimAmtRate2: contract.interimAmtRate2 ?? "",
    interimAmt3: contract.interimAmt3 ?? "",
    interimAmtRate3: contract.interimAmtRate3 ?? "",
    interimAmt4: contract.interimAmt4 ?? "",
    interimAmtRate4: contract.interimAmtRate4 ?? "",
    interimAmt5: contract.interimAmt5 ?? "",
    interimAmtRate5: contract.interimAmtRate5 ?? "",
    remainAmt: contract.remainAmt ?? "",
    remainAmtRate: contract.remainAmtRate ?? "",

    // Section 5: 보증·이행 (11 editable)
    contImplYn: contract.contImplYn ?? "N",
    contPublYn: contract.contPublYn ?? "N",
    contGrtRate: contract.contGrtRate ?? "",
    advanImplYn: contract.advanImplYn ?? "N",
    advanPublYn: contract.advanPublYn ?? "N",
    advanGrtRate: contract.advanGrtRate ?? "",
    defectImplYn: contract.defectImplYn ?? "N",
    defectPublYn: contract.defectPublYn ?? "N",
    defectGrtRate: contract.defectGrtRate ?? "",
    defectEymd: contract.defectEymd ?? "",
    inspecConfYmd: contract.inspecConfYmd ?? "",

    // Section 6: 계획 일정 (14 editable)
    startAmtPlanYmd: contract.startAmtPlanYmd ?? "",
    startAmtPublYn: contract.startAmtPublYn ?? "N",
    interimAmtPlanYmd1: contract.interimAmtPlanYmd1 ?? "",
    interimAmtPublYn1: contract.interimAmtPublYn1 ?? "N",
    interimAmtPlanYmd2: contract.interimAmtPlanYmd2 ?? "",
    interimAmtPublYn2: contract.interimAmtPublYn2 ?? "N",
    interimAmtPlanYmd3: contract.interimAmtPlanYmd3 ?? "",
    interimAmtPublYn3: contract.interimAmtPublYn3 ?? "N",
    interimAmtPlanYmd4: contract.interimAmtPlanYmd4 ?? "",
    interimAmtPublYn4: contract.interimAmtPublYn4 ?? "N",
    interimAmtPlanYmd5: contract.interimAmtPlanYmd5 ?? "",
    interimAmtPublYn5: contract.interimAmtPublYn5 ?? "N",
    remainAmtPlanYmd: contract.remainAmtPlanYmd ?? "",
    remainAmtPublYn: contract.remainAmtPublYn ?? "N",

    // Section 7: 부가정보 (4 editable)
    befContNo: contract.befContNo ?? "",
    contCancelYn: contract.contCancelYn ?? "N",
    docNo: contract.docNo ?? "",
    memo: contract.memo ?? "",
  });

  function patch<K extends keyof typeof draft>(key: K, value: string) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  // Convert empty strings to null for numeric fields before saving
  function buildPatch() {
    const numericKeys = [
      "startAmt", "startAmtRate",
      "interimAmt1", "interimAmtRate1",
      "interimAmt2", "interimAmtRate2",
      "interimAmt3", "interimAmtRate3",
      "interimAmt4", "interimAmtRate4",
      "interimAmt5", "interimAmtRate5",
      "remainAmt", "remainAmtRate",
      "contGrtRate", "advanGrtRate", "defectGrtRate",
      "sucProb",
    ] as const;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const patch: Record<string, any> = { ...draft };
    for (const k of numericKeys) {
      if (patch[k] === "") patch[k] = null;
    }
    return patch;
  }

  function handleSave() {
    startTransition(async () => {
      const result = await saveContracts({
        creates: [],
        updates: [{ id: contract.id, ...buildPatch() }],
        deletes: [],
      });
      if (result.ok) {
        router.push("/sales/contracts");
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
      await saveContracts({
        creates: [],
        updates: [],
        deletes: [contract.id],
      });
      router.push("/sales/contracts");
    });
  }

  function handleBack() {
    router.push("/sales/contracts");
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-6">

      {/* ── Section 1: 계약 기본 ──────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">계약 기본</h2>
        <div className="grid grid-cols-2 gap-4">
          <Field
            label="계약명"
            value={draft.contNm}
            required
            onChange={(v) => patch("contNm", v)}
          />
          <Field
            label="계약구분코드"
            value={draft.contGbCd}
            placeholder="코드 입력 (추후 팝업 지원 예정)"
            onChange={(v) => patch("contGbCd", v)}
          />
          <Field
            label="주계약유형"
            value={draft.mainContType}
            placeholder="코드 입력 (추후 팝업 지원 예정)"
            onChange={(v) => patch("mainContType", v)}
          />
          <Field
            label="계약일"
            value={draft.contYmd}
            type="date"
            onChange={(v) => patch("contYmd", v)}
          />
          <Field
            label="계약시작일"
            value={draft.contSymd}
            type="date"
            onChange={(v) => patch("contSymd", v)}
          />
          <Field
            label="계약종료일"
            value={draft.contEymd}
            type="date"
            onChange={(v) => patch("contEymd", v)}
          />
          <Field
            label="내외부구분"
            value={draft.inOutType}
            placeholder="코드 입력 (추후 팝업 지원 예정)"
            onChange={(v) => patch("inOutType", v)}
          />
          <div className="flex flex-col gap-3 pt-1">
            <BooleanField
              label="신규계약여부"
              checked={draft.newYn}
              onChange={(v) => patch("newYn", v)}
            />
            <BooleanField
              label="최초계약여부"
              checked={draft.contInitYn}
              onChange={(v) => patch("contInitYn", v)}
            />
          </div>
        </div>
      </section>

      {/* ── Section 2: 회사·거래처 ──────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">회사·거래처</h2>
        <div className="grid grid-cols-2 gap-4">
          <Field
            label="회사코드"
            value={contract.companyCd ?? ""}
            readOnly
          />
          <Field
            label="회사유형"
            value={draft.companyType}
            placeholder="코드 입력 (추후 팝업 지원 예정)"
            onChange={(v) => patch("companyType", v)}
          />
          <Field
            label="회사그룹명"
            value={draft.companyGrpNm}
            onChange={(v) => patch("companyGrpNm", v)}
          />
          <Field
            label="회사명"
            value={draft.companyNm}
            onChange={(v) => patch("companyNm", v)}
          />
          <Field
            label="회사번호"
            value={draft.companyNo}
            onChange={(v) => patch("companyNo", v)}
          />
          <Field
            label="회사주소"
            value={draft.companyAddr}
            onChange={(v) => patch("companyAddr", v)}
          />
          <Field
            label="회사대표자"
            value={draft.companyOner}
            onChange={(v) => patch("companyOner", v)}
          />
          <Field
            label="고객사명"
            value={draft.custNm}
            onChange={(v) => patch("custNm", v)}
          />
        </div>
      </section>

      {/* ── Section 3: 담당자·기타 ──────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">담당자·기타</h2>
        <div className="grid grid-cols-2 gap-4">
          <Field
            label="고객담당자번호"
            value={draft.customerNo}
            onChange={(v) => patch("customerNo", v)}
          />
          <Field
            label="고객담당자이메일"
            value={draft.customerEmail}
            onChange={(v) => patch("customerEmail", v)}
          />
          <Field
            label="수주확률 (%)"
            value={draft.sucProb}
            type="numeric"
            placeholder="0~100"
            onChange={(v) => patch("sucProb", v)}
          />
        </div>
      </section>

      {/* ── Section 4: 계약 금액 ──────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">계약 금액</h2>
        <div className="grid grid-cols-2 gap-4">
          {/*착수금 */}
          <Field
            label="착수금"
            value={draft.startAmt}
            type="numeric"
            onChange={(v) => patch("startAmt", v)}
          />
          <Field
            label="착수금 비율 (%)"
            value={draft.startAmtRate}
            type="numeric"
            onChange={(v) => patch("startAmtRate", v)}
          />
          {/* 중도금 1 */}
          <Field
            label="중도금1"
            value={draft.interimAmt1}
            type="numeric"
            onChange={(v) => patch("interimAmt1", v)}
          />
          <Field
            label="중도금1 비율 (%)"
            value={draft.interimAmtRate1}
            type="numeric"
            onChange={(v) => patch("interimAmtRate1", v)}
          />
          {/* 중도금 2 */}
          <Field
            label="중도금2"
            value={draft.interimAmt2}
            type="numeric"
            onChange={(v) => patch("interimAmt2", v)}
          />
          <Field
            label="중도금2 비율 (%)"
            value={draft.interimAmtRate2}
            type="numeric"
            onChange={(v) => patch("interimAmtRate2", v)}
          />
          {/* 중도금 3 */}
          <Field
            label="중도금3"
            value={draft.interimAmt3}
            type="numeric"
            onChange={(v) => patch("interimAmt3", v)}
          />
          <Field
            label="중도금3 비율 (%)"
            value={draft.interimAmtRate3}
            type="numeric"
            onChange={(v) => patch("interimAmtRate3", v)}
          />
          {/* 중도금 4 */}
          <Field
            label="중도금4"
            value={draft.interimAmt4}
            type="numeric"
            onChange={(v) => patch("interimAmt4", v)}
          />
          <Field
            label="중도금4 비율 (%)"
            value={draft.interimAmtRate4}
            type="numeric"
            onChange={(v) => patch("interimAmtRate4", v)}
          />
          {/* 중도금 5 */}
          <Field
            label="중도금5"
            value={draft.interimAmt5}
            type="numeric"
            onChange={(v) => patch("interimAmt5", v)}
          />
          <Field
            label="중도금5 비율 (%)"
            value={draft.interimAmtRate5}
            type="numeric"
            onChange={(v) => patch("interimAmtRate5", v)}
          />
          {/* 잔금 */}
          <Field
            label="잔금"
            value={draft.remainAmt}
            type="numeric"
            onChange={(v) => patch("remainAmt", v)}
          />
          <Field
            label="잔금 비율 (%)"
            value={draft.remainAmtRate}
            type="numeric"
            onChange={(v) => patch("remainAmtRate", v)}
          />
        </div>
      </section>

      {/* ── Section 5: 보증·이행 ──────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">보증·이행</h2>
        {/* 9 Y/N + rate cells in grid-cols-3: 이행|발행|보증율 x 계약/선급/하자 */}
        <div className="grid grid-cols-3 gap-4">
          {/* Header labels */}
          <div className="text-xs font-semibold uppercase text-gray-500">이행여부</div>
          <div className="text-xs font-semibold uppercase text-gray-500">발행여부</div>
          <div className="text-xs font-semibold uppercase text-gray-500">보증율 (%)</div>

          {/* 계약보증 */}
          <div className="space-y-1">
            <p className="text-xs text-gray-500">계약보증</p>
            <BooleanField
              label="계약이행여부"
              checked={draft.contImplYn}
              onChange={(v) => patch("contImplYn", v)}
            />
          </div>
          <div className="space-y-1">
            <p className="text-xs text-gray-500">계약보증</p>
            <BooleanField
              label="계약발행여부"
              checked={draft.contPublYn}
              onChange={(v) => patch("contPublYn", v)}
            />
          </div>
          <Field
            label="계약보증율"
            value={draft.contGrtRate}
            type="numeric"
            onChange={(v) => patch("contGrtRate", v)}
          />

          {/* 선급보증 */}
          <div className="space-y-1">
            <p className="text-xs text-gray-500">선급보증</p>
            <BooleanField
              label="선급이행여부"
              checked={draft.advanImplYn}
              onChange={(v) => patch("advanImplYn", v)}
            />
          </div>
          <div className="space-y-1">
            <p className="text-xs text-gray-500">선급보증</p>
            <BooleanField
              label="선급발행여부"
              checked={draft.advanPublYn}
              onChange={(v) => patch("advanPublYn", v)}
            />
          </div>
          <Field
            label="선급보증율"
            value={draft.advanGrtRate}
            type="numeric"
            onChange={(v) => patch("advanGrtRate", v)}
          />

          {/* 하자보증 */}
          <div className="space-y-1">
            <p className="text-xs text-gray-500">하자보증</p>
            <BooleanField
              label="하자이행여부"
              checked={draft.defectImplYn}
              onChange={(v) => patch("defectImplYn", v)}
            />
          </div>
          <div className="space-y-1">
            <p className="text-xs text-gray-500">하자보증</p>
            <BooleanField
              label="하자발행여부"
              checked={draft.defectPublYn}
              onChange={(v) => patch("defectPublYn", v)}
            />
          </div>
          <Field
            label="하자보증율"
            value={draft.defectGrtRate}
            type="numeric"
            onChange={(v) => patch("defectGrtRate", v)}
          />
        </div>
        {/* Two date fields below the 3×3 grid */}
        <div className="grid grid-cols-2 gap-4">
          <Field
            label="하자보증만료일"
            value={draft.defectEymd}
            type="date"
            onChange={(v) => patch("defectEymd", v)}
          />
          <Field
            label="검사확인일"
            value={draft.inspecConfYmd}
            type="date"
            onChange={(v) => patch("inspecConfYmd", v)}
          />
        </div>
      </section>

      {/* ── Section 6: 계획 일정 (collapsible) ──────────────────────────── */}
      <section className="space-y-4">
        <details>
          <summary className="cursor-pointer text-lg font-semibold text-gray-900 hover:text-blue-600">
            계획 일정 (14개 항목)
          </summary>
          <div className="mt-4 grid grid-cols-2 gap-4">
            {/* 착수금 계획일 */}
            <Field
              label="착수금 계획일"
              value={draft.startAmtPlanYmd}
              type="date"
              onChange={(v) => patch("startAmtPlanYmd", v)}
            />
            <div className="flex items-end pb-2">
              <BooleanField
                label="착수금 발행여부"
                checked={draft.startAmtPublYn}
                onChange={(v) => patch("startAmtPublYn", v)}
              />
            </div>
            {/* 중도금1 계획일 */}
            <Field
              label="중도금1 계획일"
              value={draft.interimAmtPlanYmd1}
              type="date"
              onChange={(v) => patch("interimAmtPlanYmd1", v)}
            />
            <div className="flex items-end pb-2">
              <BooleanField
                label="중도금1 발행여부"
                checked={draft.interimAmtPublYn1}
                onChange={(v) => patch("interimAmtPublYn1", v)}
              />
            </div>
            {/* 중도금2 계획일 */}
            <Field
              label="중도금2 계획일"
              value={draft.interimAmtPlanYmd2}
              type="date"
              onChange={(v) => patch("interimAmtPlanYmd2", v)}
            />
            <div className="flex items-end pb-2">
              <BooleanField
                label="중도금2 발행여부"
                checked={draft.interimAmtPublYn2}
                onChange={(v) => patch("interimAmtPublYn2", v)}
              />
            </div>
            {/* 중도금3 계획일 */}
            <Field
              label="중도금3 계획일"
              value={draft.interimAmtPlanYmd3}
              type="date"
              onChange={(v) => patch("interimAmtPlanYmd3", v)}
            />
            <div className="flex items-end pb-2">
              <BooleanField
                label="중도금3 발행여부"
                checked={draft.interimAmtPublYn3}
                onChange={(v) => patch("interimAmtPublYn3", v)}
              />
            </div>
            {/* 중도금4 계획일 */}
            <Field
              label="중도금4 계획일"
              value={draft.interimAmtPlanYmd4}
              type="date"
              onChange={(v) => patch("interimAmtPlanYmd4", v)}
            />
            <div className="flex items-end pb-2">
              <BooleanField
                label="중도금4 발행여부"
                checked={draft.interimAmtPublYn4}
                onChange={(v) => patch("interimAmtPublYn4", v)}
              />
            </div>
            {/* 중도금5 계획일 */}
            <Field
              label="중도금5 계획일"
              value={draft.interimAmtPlanYmd5}
              type="date"
              onChange={(v) => patch("interimAmtPlanYmd5", v)}
            />
            <div className="flex items-end pb-2">
              <BooleanField
                label="중도금5 발행여부"
                checked={draft.interimAmtPublYn5}
                onChange={(v) => patch("interimAmtPublYn5", v)}
              />
            </div>
            {/* 잔금 계획일 */}
            <Field
              label="잔금 계획일"
              value={draft.remainAmtPlanYmd}
              type="date"
              onChange={(v) => patch("remainAmtPlanYmd", v)}
            />
            <div className="flex items-end pb-2">
              <BooleanField
                label="잔금 발행여부"
                checked={draft.remainAmtPublYn}
                onChange={(v) => patch("remainAmtPublYn", v)}
              />
            </div>
          </div>
        </details>
      </section>

      {/* ── Section 7: 부가정보 ──────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">부가정보</h2>
        <div className="grid grid-cols-2 gap-4">
          <Field
            label="이전계약번호"
            value={draft.befContNo}
            onChange={(v) => patch("befContNo", v)}
          />
          <Field
            label="문서번호"
            value={draft.docNo}
            onChange={(v) => patch("docNo", v)}
          />
          <div className="flex items-end pb-2">
            <BooleanField
              label="계약취소여부"
              checked={draft.contCancelYn}
              onChange={(v) => patch("contCancelYn", v)}
            />
          </div>
          {/* legacy readonly fields */}
          <Field
            label="레거시 입력코드"
            value={contract.legacyEnterCd ?? ""}
            readOnly
          />
          <Field
            label="레거시 계약년도"
            value={contract.legacyContYear ?? ""}
            readOnly
          />
          <Field
            label="레거시 계약번호"
            value={contract.legacyContNo ?? ""}
            readOnly
          />
        </div>
        <TextareaField
          label="메모"
          value={draft.memo}
          onChange={(v) => patch("memo", v)}
        />
      </section>

      {/* ── Audit footer (readonly) ──────────────────────────────────────── */}
      <section className="space-y-4 border-t border-gray-200 pt-4">
        <h2 className="text-base font-semibold text-gray-500">감사 정보</h2>
        <div className="grid grid-cols-2 gap-4">
          <Field label="생성일시" value={contract.createdAt} readOnly />
          <Field label="수정일시" value={contract.updatedAt ?? ""} readOnly />
          <Field label="생성자" value={contract.createdBy ?? ""} readOnly />
          <Field label="수정자" value={contract.updatedBy ?? ""} readOnly />
        </div>
      </section>

      {/* ── Action buttons ──────────────────────────────────────── */}
      <div className="flex gap-3 border-t border-gray-200 pt-4">
        <button
          type="button"
          disabled={isPending || !draft.contNm.trim()}
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
