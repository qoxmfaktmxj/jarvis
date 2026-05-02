"use client";

/**
 * PlanDivCostDetailsModal — sub-row editor for sales_plan_div_cost_detail
 * (TBIZ028).
 *
 * Opens when the parent grid's "관리" cell is clicked. Renders an inline table
 * inside a shadcn Dialog with EditableTextCell / EditableNumericCell components.
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
import { EditableTextCell } from "@/components/grid/cells/EditableTextCell";
import { EditableNumericCell } from "@/components/grid/cells/EditableNumericCell";
import { toast } from "@/hooks/use-toast";
import {
  listPlanDivCostDetails,
  savePlanDivCostDetails,
} from "../../_lib/finance-actions";
import type { SalesPlanDivCostDetailRow } from "@jarvis/shared/validation/sales-finance";

type RowState = "clean" | "new" | "dirty" | "deleted";

type EditableRow = SalesPlanDivCostDetailRow & { _state: RowState };

type Props = {
  parentId: string | null;
  onClose: () => void;
};

export function PlanDivCostDetailsModal({ parentId, onClose }: Props) {
  const t = useTranslations("Sales.PlanDivCosts.subRow");
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [loading, startLoadTransition] = useTransition();
  const [saving, startSaveTransition] = useTransition();

  const dirtyCount = rows.filter((r) => r._state !== "clean").length;
  const open = parentId !== null;

  const loadRows = useCallback(
    (id: string) => {
      startLoadTransition(async () => {
        const res = await listPlanDivCostDetails({ planDivCostId: id });
        if (res.ok) {
          setRows(res.rows.map((r) => ({ ...r, _state: "clean" as const })));
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

  const insertBlank = () => {
    const blank: EditableRow = {
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
      _state: "new",
    };
    setRows((prev) => [...prev, blank]);
  };

  const updateField = <K extends keyof SalesPlanDivCostDetailRow>(
    id: string,
    key: K,
    value: SalesPlanDivCostDetailRow[K],
  ) => {
    setRows((prev) =>
      prev.map((r) =>
        r.id === id
          ? { ...r, [key]: value, _state: r._state === "new" ? "new" : "dirty" }
          : r,
      ),
    );
  };

  const toggleDelete = (id: string) => {
    setRows((prev) =>
      prev.flatMap((r) => {
        if (r.id !== id) return [r];
        if (r._state === "new") return [];
        if (r._state === "deleted") return [{ ...r, _state: "clean" as const }];
        return [{ ...r, _state: "deleted" as const }];
      }),
    );
  };

  const save = () => {
    if (!parentId) return;
    // Pluck only the legacy/identity + rate columns the server expects on
    // writable payloads. workspaceId / planDivCostId / audit fields are
    // server-managed.
    const writable = (r: EditableRow) => ({
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
    startSaveTransition(async () => {
      const creates = rows.filter((r) => r._state === "new").map(writable);
      const updates = rows
        .filter((r) => r._state === "dirty")
        .map((r) => ({ id: r.id, ...writable(r) }));
      const deletes = rows.filter((r) => r._state === "deleted").map((r) => r.id);

      const res = await savePlanDivCostDetails({ planDivCostId: parentId, creates, updates, deletes });
      if (res.ok) {
        toast({ title: t("saved") });
        loadRows(parentId);
      } else {
        toast({
          variant: "destructive",
          title: t("saveFailed"),
          description: res.errors?.map((e) => e.message).join("\n") ?? "",
        });
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        {/* Toolbar */}
        <div className="flex items-center gap-2 border-b border-(--border-default) pb-2">
          <Button size="sm" variant="secondary" onClick={insertBlank} disabled={loading || saving}>
            {t("insert")}
          </Button>
          <Button size="sm" variant="default" onClick={save} disabled={dirtyCount === 0 || saving}>
            {saving ? t("saving") : t("save", { count: dirtyCount })}
          </Button>
          <div className="ml-auto">
            <Button size="sm" variant="ghost" onClick={onClose} disabled={saving}>
              {t("close")}
            </Button>
          </div>
        </div>

        {/* Inline grid */}
        <div className="flex-1 overflow-auto rounded border border-(--border-default)">
          <table className="min-w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-(--bg-surface) text-[11px] font-semibold uppercase tracking-wide text-(--fg-secondary)">
              <tr className="border-b border-(--border-default)">
                <th className="w-10 px-2 py-2">삭제</th>
                <th className="px-2 py-2 text-left">{t("columns.subCostCd")}</th>
                <th className="px-2 py-2 text-right">{t("columns.planRate")}</th>
                <th className="px-2 py-2 text-right">{t("columns.prdtRate")}</th>
                <th className="px-2 py-2 text-right">{t("columns.performRate")}</th>
                <th className="px-2 py-2 text-left">{t("columns.useYn")}</th>
                <th className="px-2 py-2 text-left">{t("columns.legacyEnterCd")}</th>
                <th className="px-2 py-2 text-left">{t("columns.costCd")}</th>
                <th className="px-2 py-2 text-left">{t("columns.accountType")}</th>
                <th className="px-2 py-2 text-left">{t("columns.ym")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-sm text-(--fg-muted)">
                    {loading ? "…" : t("empty")}
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr
                    key={r.id}
                    data-row-state={r._state}
                    className={[
                      "border-b border-(--border-default)",
                      r._state === "deleted" ? "bg-rose-50/40 line-through opacity-70" : "",
                      r._state === "new" ? "bg-blue-50/40" : "",
                      r._state === "dirty" ? "bg-amber-50/40" : "",
                    ].join(" ")}
                  >
                    <td className="h-8 w-10 px-2 text-center align-middle">
                      <input
                        type="checkbox"
                        checked={r._state === "deleted"}
                        onChange={() => toggleDelete(r.id)}
                        className="h-4 w-4 rounded border-(--border-default) text-(--brand-primary) focus:ring-2 focus:ring-(--border-focus) focus:ring-offset-0"
                      />
                    </td>
                    <td className="h-8 p-0 align-middle">
                      <EditableTextCell
                        value={r.subCostCd}
                        onCommit={(v) => updateField(r.id, "subCostCd", v)}
                      />
                    </td>
                    <td className="h-8 p-0 align-middle">
                      <EditableNumericCell
                        value={r.planRate === null || r.planRate === undefined || r.planRate === "" ? null : Number(r.planRate)}
                        onChange={(next) =>
                          updateField(r.id, "planRate", next === null ? null : String(next))
                        }
                      />
                    </td>
                    <td className="h-8 p-0 align-middle">
                      <EditableNumericCell
                        value={r.prdtRate === null || r.prdtRate === undefined || r.prdtRate === "" ? null : Number(r.prdtRate)}
                        onChange={(next) =>
                          updateField(r.id, "prdtRate", next === null ? null : String(next))
                        }
                      />
                    </td>
                    <td className="h-8 p-0 align-middle">
                      <EditableNumericCell
                        value={r.performRate === null || r.performRate === undefined || r.performRate === "" ? null : Number(r.performRate)}
                        onChange={(next) =>
                          updateField(r.id, "performRate", next === null ? null : String(next))
                        }
                      />
                    </td>
                    <td className="h-8 p-0 align-middle">
                      <EditableTextCell
                        value={r.useYn}
                        onCommit={(v) => updateField(r.id, "useYn", v)}
                      />
                    </td>
                    <td className="h-8 px-2 align-middle text-[13px] text-(--fg-muted)">
                      {r.legacyEnterCd ?? ""}
                    </td>
                    <td className="h-8 px-2 align-middle text-[13px] text-(--fg-muted)">
                      {r.costCd ?? ""}
                    </td>
                    <td className="h-8 px-2 align-middle text-[13px] text-(--fg-muted)">
                      {r.accountType ?? ""}
                    </td>
                    <td className="h-8 px-2 align-middle text-[13px] text-(--fg-muted)">
                      {r.ym ?? ""}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
