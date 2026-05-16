"use client";

/**
 * PurchaseProjectsModal — sub-row editor for sales_purchase_project (TBIZ041).
 *
 * Opens when the parent grid's "관리" cell is clicked. Renders DataGrid
 * inside a shadcn Dialog. DataGrid's own toolbar (입력/저장) is used;
 * the modal provides only a close button in the footer area.
 *
 * Scope (per parent SUB_ROW_TODO.md):
 * - Editable: subContNo · pjtCode · pjtNm
 * - Pre-filled / readonly: legacyEnterCd · legacyContYear · legacyContNo
 *   (server still re-applies parent values defensively when client omits)
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
  listPurchaseProjects,
  savePurchaseProjects,
} from "../../_lib/finance-actions";
import type { SalesPurchaseProjectRow } from "@jarvis/shared/validation/sales-finance";
import type { ColumnDef, GridChanges, GridSaveResult } from "@/components/grid/types";

type Props = {
  parentId: string | null;
  onClose: () => void;
};

export function PurchaseProjectsModal({ parentId, onClose }: Props) {
  const t = useTranslations("Sales.Purchases.subRow");
  const [rows, setRows] = useState<SalesPurchaseProjectRow[]>([]);
  const [loading, startLoadTransition] = useTransition();

  const open = parentId !== null;

  const loadRows = useCallback(
    (id: string) => {
      startLoadTransition(async () => {
        const res = await listPurchaseProjects({ purchaseId: id });
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

  const columns: ColumnDef<SalesPurchaseProjectRow>[] = [
    { key: "subContNo", label: t("columns.subContNo"), type: "text", editable: true, width: 160 },
    { key: "pjtCode", label: t("columns.pjtCode"), type: "text", editable: true, width: 140 },
    { key: "pjtNm", label: t("columns.pjtNm"), type: "text", editable: true },
    { key: "legacyEnterCd", label: t("columns.legacyEnterCd"), type: "readonly", width: 80 },
    { key: "legacyContYear", label: t("columns.legacyContYear"), type: "readonly", width: 90 },
    { key: "legacyContNo", label: t("columns.legacyContNo"), type: "readonly", width: 130 },
  ];

  const makeBlankRow = useCallback((): SalesPurchaseProjectRow => ({
    id: crypto.randomUUID(),
    workspaceId: "",
    purchaseId: parentId,
    legacyEnterCd: null,
    legacyContYear: null,
    legacyContNo: null,
    legacySeq: null,
    legacyPurSeq: null,
    subContNo: null,
    pjtCode: null,
    pjtNm: null,
    createdAt: new Date().toISOString(),
    updatedAt: null,
    createdBy: null,
    updatedBy: null,
  }), [parentId]);

  const handleSave = useCallback(
    async (changes: GridChanges<SalesPurchaseProjectRow>): Promise<GridSaveResult> => {
      if (!parentId) return { ok: false, errors: [{ message: "parentId missing" }] };

      const writable = (r: SalesPurchaseProjectRow) => ({
        legacyEnterCd: r.legacyEnterCd,
        legacyContYear: r.legacyContYear,
        legacyContNo: r.legacyContNo,
        legacySeq: r.legacySeq,
        legacyPurSeq: r.legacyPurSeq,
        subContNo: r.subContNo,
        pjtCode: r.pjtCode,
        pjtNm: r.pjtNm,
      });

      const creates = changes.creates.map(writable);
      // updates: patch contains only changed fields; server schema is .partial()
      // so we can pass the patch fields directly without merging a full row.
      const updates = changes.updates.map((u) => ({
        id: u.id,
        ...u.patch,
      }));
      const deletes = changes.deletes;

      const res = await savePurchaseProjects({ purchaseId: parentId, creates, updates, deletes });
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
          <DataGrid<SalesPurchaseProjectRow>
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
