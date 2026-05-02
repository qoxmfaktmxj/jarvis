"use client";

// Sub-row sales_plan_div_cost_detail (TBIZ028, FK: plan_div_cost_id) edited via
// modal triggered from each row's "관리" cell. See PlanDivCostDetailsModal.tsx
// and the listPlanDivCostDetails / savePlanDivCostDetails server actions in
// apps/web/app/(app)/sales/_lib/finance-actions.ts.

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { ColumnDef } from "@/components/grid/types";
import { Button } from "@/components/ui/button";
import { SalesFinanceGridContainer } from "../../_components/SalesFinanceGridContainer";
import {
  exportPlanDivCostsToExcel,
  listPlanDivCosts,
  savePlanDivCosts,
} from "../../_lib/finance-actions";
import type { SalesPlanDivCostRow } from "@jarvis/shared/validation/sales-finance";
import { PlanDivCostDetailsModal } from "./PlanDivCostDetailsModal";

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
  const [activeParentId, setActiveParentId] = useState<string | null>(null);

  const columns: ColumnDef<SalesPlanDivCostRow>[] = [
    { key: "costCd", label: t("columns.costCd"), type: "text", width: 120, editable: true },
    { key: "accountType", label: t("columns.accountType"), type: "text", width: 110, editable: true },
    { key: "ym", label: t("columns.ym"), type: "text", width: 90, editable: true },
    { key: "planAmt", label: t("columns.planAmt"), type: "numeric", width: 120, editable: true },
    { key: "prdtAmt", label: t("columns.prdtAmt"), type: "numeric", width: 120, editable: true },
    { key: "performAmt", label: t("columns.performAmt"), type: "numeric", width: 120, editable: true },
    { key: "note", label: t("columns.note"), type: "textarea", width: 220, editable: true },
    {
      // Manage button — opens the sub-row modal for this plan-div-cost row.
      // Reuses `id` key with custom render() (same pattern as activities).
      key: "id" as keyof SalesPlanDivCostRow & string,
      label: t("columns.manage"),
      type: "readonly",
      width: 80,
      render: (row) => (
        <Button
          size="sm"
          variant="secondary"
          data-testid="plan-div-cost-manage-btn"
          data-plan-div-cost-id={row.id}
          onClick={(e) => {
            e.stopPropagation();
            setActiveParentId(row.id);
          }}
        >
          {t("columns.manage")}
        </Button>
      ),
    },
    { key: "updatedAt", label: t("columns.updatedAt"), type: "readonly", width: 150 },
  ];

  return (
    <>
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
      <PlanDivCostDetailsModal
        parentId={activeParentId}
        onClose={() => setActiveParentId(null)}
      />
    </>
  );
}
