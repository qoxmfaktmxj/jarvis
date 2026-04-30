"use client";

import { useCallback, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { type CompanyRow } from "@jarvis/shared/validation/company";
import { listCompanies, saveCompanies } from "../actions";
import { useCompaniesGridState } from "./useCompaniesGridState";
import { GridToolbar } from "./GridToolbar";
import { ColumnFilterRow, type CompaniesFilters, type Option } from "./ColumnFilterRow";
import { RowStatusBadge } from "./RowStatusBadge";
import { UnsavedChangesDialog } from "./UnsavedChangesDialog";
import { EditableTextCell } from "./cells/EditableTextCell";
import { EditableSelectCell } from "./cells/EditableSelectCell";
import { EditableDateCell } from "./cells/EditableDateCell";
import { EditableBooleanCell } from "./cells/EditableBooleanCell";

type Company = CompanyRow;

type Props = {
  initial: Company[];
  total: number;
  objectDivOptions: Option[];
  groupOptions: Option[];
  industryOptions: Option[];
};

const PAGE_SIZE = 50;

function makeBlankRow(): Company {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    code: "",
    name: "",
    groupCode: null,
    objectDiv: "001",
    manageDiv: null,
    representCompany: false,
    category: null,
    startDate: null,
    industryCode: null,
    zip: null,
    address: null,
    homepage: null,
    updatedBy: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function CompaniesGrid({
  initial,
  total,
  objectDivOptions,
  groupOptions,
  industryOptions,
}: Props) {
  const t = useTranslations("Admin.Companies");
  const tc = useTranslations("Admin.Companies.columns");
  const tp = useTranslations("Admin.Companies.pagination");
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<CompaniesFilters>({});
  const [totalCount, setTotalCount] = useState(total);
  const grid = useCompaniesGridState<Company>(initial);
  const [selected, setSelected] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [pendingNav, setPendingNav] = useState<null | (() => void)>(null);

  const reload = useCallback(
    (nextPage: number, nextFilters: CompaniesFilters) => {
      startTransition(async () => {
        const res = await listCompanies({
          ...nextFilters,
          page: nextPage,
          limit: PAGE_SIZE,
        });
        if (!res.ok) return;
        grid.reset(res.rows as Company[]);
        setTotalCount(res.total as number);
        setPage(nextPage);
        setFilters(nextFilters);
      });
    },
    [grid],
  );

  const guarded = useCallback(
    (action: () => void) => {
      if (grid.dirtyCount > 0) {
        setPendingNav(() => action);
      } else {
        action();
      }
    },
    [grid.dirtyCount],
  );

  const onSave = useCallback(async () => {
    const batch = grid.toBatch();
    const result = await saveCompanies(batch);
    if (result.ok) {
      reload(page, filters);
    } else {
      const msg = result.errors.map((e) => e.message).join("\n") || "save failed";
      alert(msg);
    }
  }, [grid, page, filters, reload]);

  const onInsert = useCallback(() => {
    grid.insertBlank(makeBlankRow());
  }, [grid]);

  const onCopy = useCallback(() => {
    if (!selected) return;
    grid.duplicate(selected, (c) => ({
      ...c,
      id: crypto.randomUUID(),
      code: "",
    }));
  }, [grid, selected]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-600">{t("total", { count: totalCount })}</span>
        <GridToolbar
          dirtyCount={grid.dirtyCount}
          saving={pending}
          onInsert={onInsert}
          onCopy={onCopy}
          onSave={onSave}
        />
      </div>

      <div className="overflow-auto rounded border border-slate-200">
        <table className="min-w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
            <tr className="border-b border-slate-200">
              <th className="w-10 px-2 py-2 text-left">{tc("no")}</th>
              <th className="w-10 px-2 py-2">{tc("delete")}</th>
              <th className="w-16 px-2 py-2 text-left">{tc("status")}</th>
              <th className="w-28 px-2 py-2 text-left">{tc("objectDiv")}</th>
              <th className="w-32 px-2 py-2 text-left">{tc("groupCode")}</th>
              <th className="w-28 px-2 py-2 text-left">{tc("code")}</th>
              <th className="min-w-[200px] px-2 py-2 text-left">{tc("name")}</th>
              <th className="w-24 px-2 py-2">{tc("representCompany")}</th>
              <th className="w-32 px-2 py-2 text-left">{tc("startDate")}</th>
              <th className="w-32 px-2 py-2 text-left">{tc("industryCode")}</th>
              <th className="w-24 px-2 py-2 text-left">{tc("zip")}</th>
            </tr>
            <ColumnFilterRow
              filters={filters}
              onChange={(next) => guarded(() => reload(1, next))}
              objectDivOptions={objectDivOptions}
              groupOptions={groupOptions}
              industryOptions={industryOptions}
            />
          </thead>
          <tbody>
            {grid.rows.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-4 py-12 text-center text-sm text-slate-500">
                  {t("emptyState") || "회사 데이터가 없습니다."}
                </td>
              </tr>
            ) : (
              grid.rows.map((r, i) => (
                <tr
                  key={r.data.id}
                  onClick={() => setSelected(r.data.id)}
                  className={[
                    "border-b border-slate-100 transition-colors duration-150",
                    "hover:bg-slate-50",
                    selected === r.data.id ? "bg-blue-50/40" : "",
                    r.state === "deleted" ? "bg-rose-50/40 line-through opacity-70" : "",
                    r.state === "new" ? "bg-blue-50/40" : "",
                    r.state === "dirty" ? "bg-amber-50/40" : "",
                  ].join(" ")}
                >
                  <td className="h-8 w-10 px-2 align-middle text-[12px] text-slate-500">
                    {(page - 1) * PAGE_SIZE + i + 1}
                  </td>
                  <td className="h-8 w-10 px-2 text-center align-middle">
                    <input
                      type="checkbox"
                      checked={r.state === "deleted"}
                      onChange={() =>
                        r.state === "new"
                          ? grid.removeNew(r.data.id)
                          : grid.toggleDelete(r.data.id)
                      }
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-0"
                    />
                  </td>
                  <td className="h-8 w-16 px-2 align-middle">
                    <RowStatusBadge state={r.state} />
                  </td>
                  <td className="h-8 w-28 p-0 align-middle">
                    <EditableSelectCell
                      value={r.data.objectDiv}
                      options={objectDivOptions}
                      onCommit={(v) => grid.update(r.data.id, "objectDiv", v ?? "001")}
                      required
                    />
                  </td>
                  <td className="h-8 w-32 p-0 align-middle">
                    <EditableSelectCell
                      value={r.data.groupCode}
                      options={groupOptions}
                      onCommit={(v) => grid.update(r.data.id, "groupCode", v)}
                    />
                  </td>
                  <td className="h-8 w-28 p-0 align-middle">
                    <EditableTextCell
                      value={r.data.code}
                      onCommit={(v) => grid.update(r.data.id, "code", v ?? "")}
                      required
                    />
                  </td>
                  <td className="h-8 min-w-[200px] p-0 align-middle">
                    <EditableTextCell
                      value={r.data.name}
                      onCommit={(v) => grid.update(r.data.id, "name", v ?? "")}
                      required
                    />
                  </td>
                  <td className="h-8 w-24 p-0 align-middle">
                    <EditableBooleanCell
                      value={r.data.representCompany}
                      onCommit={(v) => grid.update(r.data.id, "representCompany", v)}
                    />
                  </td>
                  <td className="h-8 w-32 p-0 align-middle">
                    <EditableDateCell
                      value={r.data.startDate}
                      onCommit={(v) => grid.update(r.data.id, "startDate", v)}
                    />
                  </td>
                  <td className="h-8 w-32 p-0 align-middle">
                    <EditableSelectCell
                      value={r.data.industryCode}
                      options={industryOptions}
                      onCommit={(v) => grid.update(r.data.id, "industryCode", v)}
                    />
                  </td>
                  <td className="h-8 w-24 p-0 align-middle">
                    <EditableTextCell
                      value={r.data.zip}
                      onCommit={(v) => grid.update(r.data.id, "zip", v)}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-end gap-2 text-sm text-slate-600">
        <Button
          size="sm"
          variant="outline"
          disabled={page <= 1 || pending}
          onClick={() => guarded(() => reload(page - 1, filters))}
        >
          {tp("previous")}
        </Button>
        <span>
          {page} / {totalPages}
        </span>
        <Button
          size="sm"
          variant="outline"
          disabled={page >= totalPages || pending}
          onClick={() => guarded(() => reload(page + 1, filters))}
        >
          {tp("next")}
        </Button>
      </div>

      <UnsavedChangesDialog
        open={pendingNav !== null}
        count={grid.dirtyCount}
        onSaveAndContinue={async () => {
          await onSave();
          pendingNav?.();
          setPendingNav(null);
        }}
        onDiscardAndContinue={() => {
          pendingNav?.();
          setPendingNav(null);
          reload(page, filters);
        }}
        onCancel={() => setPendingNav(null)}
      />
    </div>
  );
}
