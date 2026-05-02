"use client";

import { useTranslations } from "next-intl";
import type { ColumnDef } from "@/components/grid/types";
import { SalesFinanceGridContainer } from "../../_components/SalesFinanceGridContainer";
import {
  exportTaxBillsToExcel,
  listTaxBills,
  saveTaxBills,
} from "../../_lib/finance-actions";
import type { SalesTaxBillRow } from "@jarvis/shared/validation/sales-finance";

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
      saveAction={saveTaxBills}
      exportAction={exportTaxBillsToExcel}
    />
  );
}
