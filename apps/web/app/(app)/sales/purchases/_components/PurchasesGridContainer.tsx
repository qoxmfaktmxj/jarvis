"use client";

// Sub-row sales_purchase_project (TBIZ041, FK: purchase_id) edited via modal
// triggered from each row's "관리" cell. See PurchaseProjectsModal.tsx and the
// listPurchaseProjects / savePurchaseProjects server actions in
// apps/web/app/(app)/sales/_lib/finance-actions.ts.

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { ColumnDef } from "@/components/grid/types";
import { Button } from "@/components/ui/button";
import { SalesFinanceGridContainer } from "../../_components/SalesFinanceGridContainer";
import {
  exportPurchasesToExcel,
  listPurchases,
  savePurchases,
} from "../../_lib/finance-actions";
import type { SalesPurchaseRow } from "@jarvis/shared/validation/sales-finance";
import { PurchaseProjectsModal } from "./PurchaseProjectsModal";

type FilterState = { q: string; purType: string; baseDate: string; page: string };

type Props = {
  rows: SalesPurchaseRow[];
  total: number;
  limit: number;
  initialFilters: FilterState;
};

function makeBlankRow(): SalesPurchaseRow {
  return {
    id: crypto.randomUUID(),
    workspaceId: "",
    legacyEnterCd: null,
    legacyContYear: null,
    legacyContNo: null,
    legacySeq: null,
    legacyPurSeq: null,
    purType: null,
    sdate: null,
    edate: null,
    purNm: null,
    subAmt: null,
    amt: null,
    servSabun: null,
    servName: null,
    servBirthday: null,
    servTelNo: null,
    servAddr: null,
    note: null,
    contNm: null,
    detail: null,
    createdAt: new Date().toISOString(),
    updatedAt: null,
    createdBy: null,
    updatedBy: null,
  };
}

export function PurchasesGridContainer(props: Props) {
  const t = useTranslations("Sales.Purchases");
  const [activeParentId, setActiveParentId] = useState<string | null>(null);

  const columns: ColumnDef<SalesPurchaseRow>[] = [
    { key: "legacyContNo", label: t("columns.contNo"), type: "text", width: 110, editable: true },
    { key: "contNm", label: t("columns.contNm"), type: "readonly", width: 180 },
    { key: "legacySeq", label: t("columns.seq"), type: "numeric", width: 70, editable: true },
    { key: "legacyPurSeq", label: t("columns.purSeq"), type: "numeric", width: 70, editable: true },
    { key: "purNm", label: t("columns.purNm"), type: "text", width: 180, editable: true },
    { key: "purType", label: t("columns.purType"), type: "text", width: 90, editable: true },
    { key: "amt", label: t("columns.amt"), type: "numeric", width: 110, editable: true },
    { key: "subAmt", label: t("columns.subAmt"), type: "numeric", width: 110, editable: true },
    { key: "sdate", label: t("columns.sdate"), type: "date", width: 100, editable: true },
    { key: "edate", label: t("columns.edate"), type: "date", width: 100, editable: true },
    { key: "servName", label: t("columns.servName"), type: "text", width: 130, editable: true },
    { key: "servTelNo", label: t("columns.servTelNo"), type: "text", width: 130, editable: true },
    { key: "note", label: t("columns.note"), type: "textarea", width: 220, editable: true },
    {
      // Manage button — opens the sub-row modal for this purchase. Reuses the
      // `id` key with a custom render() (matches the activities/customers
      // pattern). Placed before audit columns so the trigger sits at the right
      // edge of the editable region.
      key: "id" as keyof SalesPurchaseRow & string,
      label: t("columns.manage"),
      type: "readonly",
      width: 80,
      render: (row) => (
        <Button
          size="sm"
          variant="secondary"
          data-testid="purchase-manage-btn"
          data-purchase-id={row.id}
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
          { key: "purType", label: t("filters.purType") },
          { key: "baseDate", label: t("filters.baseDate"), placeholder: "yyyymmdd" },
        ]}
        makeBlankRow={makeBlankRow}
        listAction={listPurchases}
        saveAction={savePurchases}
        exportAction={exportPurchasesToExcel}
      />
      <PurchaseProjectsModal
        parentId={activeParentId}
        onClose={() => setActiveParentId(null)}
      />
    </>
  );
}
