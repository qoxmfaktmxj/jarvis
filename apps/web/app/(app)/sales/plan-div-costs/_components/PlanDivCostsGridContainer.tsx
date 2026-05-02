"use client";

import { useTranslations } from "next-intl";
import type { ColumnDef } from "@/components/grid/types";
import { SalesFinanceGridContainer } from "../../_components/SalesFinanceGridContainer";
import {
  exportPlanDivCostsToExcel,
  listPlanDivCosts,
  savePlanDivCosts,
} from "../../_lib/finance-actions";
import type { SalesPlanDivCostRow } from "@jarvis/shared/validation/sales-finance";

type FilterState = { q: string; accountType: string; year: string; page: string };

type Props = {
  rows: SalesPlanDivCostRow[];
  total: number;
  limit: number;
  initialFilters: FilterState;
};

function makeBlankRow(): SalesPlanDivCostRow {
  return {
    id: crypto.randomUUID(),
    workspaceId: "",
    legacyEnterCd: null,
    costCd: null,
    accountType: null,
    ym: null,
    planAmt: null,
    prdtAmt: null,
    performAmt: null,
    note: null,
    costNm: null,
    createdAt: new Date().toISOString(),
    updatedAt: null,
    createdBy: null,
    updatedBy: null,
  };
}

export function PlanDivCostsGridContainer(props: Props) {
  const t = useTranslations("Sales.PlanDivCosts");
  const columns: ColumnDef<SalesPlanDivCostRow>[] = [
    { key: "costCd", label: t("columns.costCd"), type: "text", width: 120, editable: true },
    { key: "accountType", label: t("columns.accountType"), type: "text", width: 110, editable: true },
    { key: "ym", label: t("columns.ym"), type: "text", width: 90, editable: true },
    { key: "planAmt", label: t("columns.planAmt"), type: "numeric", width: 120, editable: true },
    { key: "prdtAmt", label: t("columns.prdtAmt"), type: "numeric", width: 120, editable: true },
    { key: "performAmt", label: t("columns.performAmt"), type: "numeric", width: 120, editable: true },
    { key: "note", label: t("columns.note"), type: "textarea", width: 220, editable: true },
    { key: "updatedAt", label: t("columns.updatedAt"), type: "readonly", width: 150 },
  ];

  return (
    <SalesFinanceGridContainer
      {...props}
      columns={columns}
      filterFields={[
        { key: "q", label: t("filters.q"), placeholder: t("filters.qPlaceholder") },
        { key: "accountType", label: t("filters.accountType") },
        { key: "year", label: t("filters.year"), placeholder: "yyyy" },
      ]}
      makeBlankRow={makeBlankRow}
      listAction={listPlanDivCosts}
      saveAction={savePlanDivCosts}
      exportAction={exportPlanDivCostsToExcel}
    />
  );
}
