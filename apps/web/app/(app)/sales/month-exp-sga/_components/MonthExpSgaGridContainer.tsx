"use client";

import { useTranslations } from "next-intl";
import type { ColumnDef } from "@/components/grid/types";
import { SalesFinanceGridContainer } from "../../_components/SalesFinanceGridContainer";
import {
  exportMonthExpSgaToExcel,
  listMonthExpSga,
  saveMonthExpSga,
} from "../../_lib/finance-actions";
import type { SalesMonthExpSgaRow } from "@jarvis/shared/validation/sales-finance";

type FilterState = { ym: string; costCd: string; page: string };

type Props = {
  rows: SalesMonthExpSgaRow[];
  total: number;
  limit: number;
  initialFilters: FilterState;
};

function makeBlankRow(): SalesMonthExpSgaRow {
  return {
    id: crypto.randomUUID(),
    workspaceId: "",
    legacyEnterCd: null,
    yyyy: null,
    mm: null,
    costCd: null,
    expAmt: null,
    sgaAmt: null,
    waers: null,
    createdAt: new Date().toISOString(),
    updatedAt: null,
    createdBy: null,
    updatedBy: null,
  };
}

export function MonthExpSgaGridContainer(props: Props) {
  const t = useTranslations("Sales.MonthExpSga");
  const columns: ColumnDef<SalesMonthExpSgaRow>[] = [
    { key: "yyyy", label: t("columns.yyyy"), type: "text", width: 80, editable: true },
    { key: "mm", label: t("columns.mm"), type: "text", width: 70, editable: true },
    { key: "costCd", label: t("columns.costCd"), type: "text", width: 120, editable: true },
    { key: "expAmt", label: t("columns.expAmt"), type: "numeric", width: 120, editable: true },
    { key: "sgaAmt", label: t("columns.sgaAmt"), type: "numeric", width: 120, editable: true },
    { key: "waers", label: t("columns.waers"), type: "text", width: 90, editable: true },
    { key: "updatedAt", label: t("columns.updatedAt"), type: "readonly", width: 150 },
  ];

  return (
    <SalesFinanceGridContainer
      {...props}
      columns={columns}
      filterFields={[
        { key: "ym", label: t("filters.ym"), placeholder: "yyyymm" },
        { key: "costCd", label: t("filters.costCd") },
      ]}
      makeBlankRow={makeBlankRow}
      listAction={listMonthExpSga}
      saveAction={saveMonthExpSga}
      exportAction={exportMonthExpSgaToExcel}
    />
  );
}
