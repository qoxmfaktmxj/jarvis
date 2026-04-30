"use client";
import { cn } from "@/lib/utils";
import type { RowStatus } from "./types";

const STYLES: Record<RowStatus, string> = {
  clean: "",
  new: "bg-blue-100 text-blue-700",
  dirty: "bg-amber-100 text-amber-700",
  deleted: "bg-rose-100 text-rose-700",
};

const LABELS: Record<RowStatus, string> = {
  clean: "",
  new: "신규",
  dirty: "변경됨",
  deleted: "삭제됨",
};

export function RowStatusBadge({ state }: { state: RowStatus }) {
  if (state === "clean") return null;
  return (
    <span
      className={cn(
        "inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold leading-tight",
        STYLES[state],
      )}
    >
      {LABELS[state]}
    </span>
  );
}
