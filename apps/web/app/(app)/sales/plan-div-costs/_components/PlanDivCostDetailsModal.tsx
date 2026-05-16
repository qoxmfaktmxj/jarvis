"use client";

/**
 * PlanDivCostDetailsModal — sub-row editor for sales_plan_div_cost_detail
 * (TBIZ028).
 *
 * Opens when the parent grid's "관리" cell is clicked. Renders DataGrid
 * inside a shadcn Dialog. DataGrid's own toolbar (입력/저장) is used;
 * the modal provides only a close button in the footer area.
 *
 * Scope (per parent DETAIL_TODO.md):
 * - Editable: subCostCd · planRate · prdtRate · performRate · useYn
 * - Pre-filled / readonly: legacyEnterCd · costCd · accountType · ym
 *   (server still re-applies parent values defensively when client omits)
 * - useYn defaults to 'Y' on insert (legacy convention; server enforces).
 *
 * NOTE: Excel export for sub-rows is OUT of scope — TODO future PR.
 */

import { useCallback, useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DataGrid } from "@/components/grid/DataGrid";
import { toast } from "@/hooks/use-toast";
import {
  listPlanDivCostDetails,
  savePlanDivCostDetails,
} from "../../_lib/finance-actions";
import type { SalesPlanDivCostDetailRow } from "@jarvis/shared/validation/sales-finance";
import type { ColumnDef, GridChanges, GridSaveResult } from "@/components/grid/types";

type Props = {
  parentId: string | null;
  onClose: () => void;
};

export function PlanDivCostDetailsModal({ parentId, onClose }: Props) {
  const t = useTranslations("Sales.PlanDivCosts.subRow");
  const [rows, setRows] = useState<SalesPlanDivCostDetailRow[]>([]);
  const [loading, startLoadTransition] = useTransition();

  const open = parentId !== null;

  const loadRows = useCallback(
    (id: string) => {
      startLoadTransition(async () => {
        const res = await listPlanDivCostDetails({ planDivCostId: id });
        if (res.ok) {
          setRows(res.rows);
        } else {
          toast({
            variant: "destructive",
            title: t("saveFailed"),
            description: res.error ?? "",
          });
          setRows([]);
        }
      });
    },
    [t],
  );

  useEffect(() => {
    if (parentId) loadRows(parentId);
    else setRows([]);
  }, [parentId, loadRows]);

  const columns: ColumnDef<SalesPlanDivCostDetailRow>[] = [
    { key: "subCostCd", label: t("columns.subCostCd"), type: "text", editable: true, width: 160 },
    { key: "planRate", label: t("columns.planRate"), type: "numeric", editable: true, width: 110 },
    { key: "prdtRate", label: t("columns.prdtRate"), type: "numeric", editable: true, width: 110 },
    { key: "performRate", label: t("columns.performRate"), type: "numeric", editable: true, width: 110 },
    { key: "useYn", label: t("columns.useYn"), type: "text", editable: true, width: 70 },
    { key: "legacyEnterCd", label: t("columns.legacyEnterCd"), type: "readonly", width: 80 },
    { key: "costCd", label: t("columns.costCd"), type: "readonly", width: 120 },
    { key: "accountType", label: t("columns.accountType"), type: "readonly", width: 100 },
    { key: "ym", label: t("columns.ym"), type: "readonly", width: 80 },
  ];

  const makeBlankRow = useCallback((): SalesPlanDivCostDetailRow => ({
    id: crypto.randomUUID(),
    workspaceId: "",
    planDivCostId: parentId,
    legacyEnterCd: null,
    costCd: null,
    accountType: null,
    ym: null,
    subCostCd: null,
    planRate: null,
    prdtRate: null,
    performRate: null,
    useYn: "Y",
    createdAt: new Date().toISOString(),
    updatedAt: null,
    createdBy: null,
    updatedBy: null,
  }), [parentId]);

  const handleSave = useCallback(
    async (changes: GridChanges<SalesPlanDivCostDetailRow>): Promise<GridSaveResult> => {
      if (!parentId) return { ok: false, errors: [{ message: "parentId missing" }] };

      const writable = (r: SalesPlanDivCostDetailRow) => ({
        legacyEnterCd: r.legacyEnterCd,
        costCd: r.costCd,
        accountType: r.accountType,
        ym: r.ym,
        subCostCd: r.subCostCd,
        planRate: r.planRate,
        prdtRate: r.prdtRate,
        performRate: r.performRate,
        useYn: r.useYn,
      });

      const creates = changes.creates.map(writable);
      // updates: patch contains only changed fields; server schema is .partial()
      // so we can pass the patch fields directly without merging a full row.
      const updates = changes.updates.map((u) => ({
        id: u.id,
        ...u.patch,
      }));
      const deletes = changes.deletes;

      const res = await savePlanDivCostDetails({ planDivCostId: parentId, creates, updates, deletes });
      if (res.ok) {
        toast({ title: t("saved") });
        loadRows(parentId);
        return { ok: true };
      } else {
        toast({
          variant: "destructive",
          title: t("saveFailed"),
          description: res.errors?.map((e) => e.message).join("\n") ?? "",
        });
        return { ok: false, errors: res.errors };
      }
    },
    [parentId, t, loadRows],
  );

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col gap-3">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        {/* DataGrid manages insert/copy/save via its own toolbar.
            The modal provides only the close button separately. */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <DataGrid<SalesPlanDivCostDetailRow>
            rows={rows}
            total={rows.length}
            columns={columns}
            filters={[]}
            page={1}
            limit={10000}
            makeBlankRow={makeBlankRow}
            onPageChange={() => {}}
            onFilterChange={() => {}}
            onSave={handleSave}
            emptyMessage={loading ? "…" : t("empty")}
            allowCopy={false}
          />
        </div>

        <div className="flex justify-end shrink-0">
          <Button size="sm" variant="ghost" onClick={onClose}>
            {t("close")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
