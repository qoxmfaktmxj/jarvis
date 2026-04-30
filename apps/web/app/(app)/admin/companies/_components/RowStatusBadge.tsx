"use client";
import { useTranslations } from "next-intl";
import type { GridRowState } from "./useCompaniesGridState";
import { cn } from "@/lib/utils";

const STYLES: Record<GridRowState, string> = {
  clean: "",
  new: "bg-blue-100 text-blue-700",
  dirty: "bg-amber-100 text-amber-700",
  deleted: "bg-rose-100 text-rose-700",
};

export function RowStatusBadge({ state }: { state: GridRowState }) {
  const t = useTranslations("Admin.Companies.status");
  if (state === "clean") return null;
  return (
    <span
      className={cn(
        "inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold leading-tight",
        STYLES[state],
      )}
    >
      {t(state)}
    </span>
  );
}
