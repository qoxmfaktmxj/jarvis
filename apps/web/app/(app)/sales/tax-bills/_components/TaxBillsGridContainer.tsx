"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";
import type { ColumnDef, GridChanges, GridSaveResult } from "@/components/grid/types";
import { toast } from "@/hooks/use-toast";
import { SalesFinanceGridContainer } from "../../_components/SalesFinanceGridContainer";
import {
  exportTaxBillsToExcel,
  listTaxBills,
  saveTaxBills,
} from "../../_lib/finance-actions";
import type { SalesTaxBillRow } from "@jarvis/shared/validation/sales-finance";

/**
 * VAT validation helper — Korean VAT standard is 10% of `amt`. We allow
 * rounding tolerance of ±1 won. Rows where `amt` or `vatAmt` is missing
 * in the change set are skipped (we can't validate without both).
 *
 * Returns the count of mismatched rows so the toast can include the figure.
 */
function countVatMismatches(changes: GridChanges<SalesTaxBillRow>): number {
  let mismatches = 0;
  const rows: { amt: string | null | undefined; vatAmt: string | null | undefined }[] = [
    ...changes.creates.map((c) => ({ amt: c.amt, vatAmt: c.vatAmt })),
    ...changes.updates.map((u) => ({ amt: u.patch.amt, vatAmt: u.patch.vatAmt })),
  ];
  for (const r of rows) {
    if (r.amt == null || r.amt === "" || r.vatAmt == null || r.vatAmt === "") continue;
    const amt = Number(r.amt);
    const vat = Number(r.vatAmt);
    if (!Number.isFinite(amt) || !Number.isFinite(vat)) continue;
    if (Math.abs(vat - amt * 0.1) > 1) mismatches++;
  }
  return mismatches;
}

type FilterState = { q: string; billType: string; ym: string; fromYmd: string; toYmd: string; page: string };

type Props = {
  rows: SalesTaxBillRow[];
  total: number;
  limit: number;
  initialFilters: FilterState;
};

function makeBlankRow(): SalesTaxBillRow {
  return {
    id: crypto.randomUUID(),
    workspaceId: "",
    legacyEnterCd: null,
    legacyContNo: null,
    legacySeq: null,
    ym: null,
    orderDivCd: null,
    costCd: null,
    pjtNm: null,
    pjtCode: null,
    purSeq: null,
    debitCreditCd: null,
    slipTargetYn: null,
    billType: null,
    slipSeq: null,
    transCode: null,
    docDate: null,
    slipType: null,
    compCd: null,
    postDate: null,
    currencyType: null,
    referSlipNo: null,
    postKey: null,
    accountType: null,
    businessArea: null,
    amt: null,
    vatAmt: null,
    briefsTxt: null,
    slipResultYn: null,
    servSabun: null,
    servName: null,
    servBirthday: null,
    servTelNo: null,
    servAddr: null,
    taxCode: null,
    businessLocation: null,
    companyNm: null,
    receiptCd: null,
    contNm: null,
    receiptNo: null,
    createdAt: new Date().toISOString(),
    updatedAt: null,
    createdBy: null,
    updatedBy: null,
  };
}

export function TaxBillsGridContainer(props: Props) {
  const t = useTranslations("Sales.TaxBills");

  // Wraps `saveTaxBills` so that, after a successful save, we check the
  // change set for rows whose VAT diverges from 10% of `amt` and surface a
  // non-blocking toast. Server contract is untouched; the warning is purely
  // an advisory client-side post-condition.
  const saveActionWithVatCheck = useCallback(
    async (input: unknown): Promise<GridSaveResult> => {
      const res = await saveTaxBills(input);
      if (res.ok) {
        const mismatches = countVatMismatches(input as GridChanges<SalesTaxBillRow>);
        if (mismatches > 0) {
          toast({
            title: t("warnings.vatMismatch", { count: mismatches }),
          });
        }
      }
      return res;
    },
    [t],
  );

  const columns: ColumnDef<SalesTaxBillRow>[] = [
    { key: "legacyContNo", label: t("columns.contNo"), type: "text", width: 110, editable: true },
    { key: "contNm", label: t("columns.contNm"), type: "readonly", width: 180 },
    { key: "companyNm", label: t("columns.companyNm"), type: "text", width: 150, editable: true },
    { key: "ym", label: t("columns.ym"), type: "text", width: 80, editable: true },
    { key: "orderDivCd", label: t("columns.orderDivCd"), type: "text", width: 90, editable: true },
    { key: "billType", label: t("columns.billType"), type: "text", width: 90, editable: true },
    { key: "debitCreditCd", label: t("columns.debitCreditCd"), type: "text", width: 90, editable: true },
    { key: "slipTargetYn", label: t("columns.slipTargetYn"), type: "boolean", width: 90, editable: true },
    { key: "amt", label: t("columns.amt"), type: "numeric", width: 110, editable: true },
    { key: "vatAmt", label: t("columns.vatAmt"), type: "numeric", width: 110, editable: true },
    { key: "postDate", label: t("columns.postDate"), type: "date", width: 100, editable: true },
    { key: "slipResultYn", label: t("columns.slipResultYn"), type: "boolean", width: 90, editable: true },
    { key: "briefsTxt", label: t("columns.briefsTxt"), type: "textarea", width: 220, editable: true },
    { key: "updatedAt", label: t("columns.updatedAt"), type: "readonly", width: 150 },
  ];

  return (
    <SalesFinanceGridContainer
      {...props}
      columns={columns}
      filterFields={[
        { key: "q", label: t("filters.q"), placeholder: t("filters.qPlaceholder") },
        { key: "billType", label: t("filters.billType") },
        { key: "ym", label: t("filters.ym"), placeholder: "yyyymm" },
        { key: "fromYmd", label: t("filters.fromYmd"), placeholder: "yyyymmdd" },
        { key: "toYmd", label: t("filters.toYmd"), placeholder: "yyyymmdd" },
      ]}
      makeBlankRow={makeBlankRow}
      listAction={listTaxBills}
      saveAction={saveActionWithVatCheck}
      exportAction={exportTaxBillsToExcel}
    />
  );
}
