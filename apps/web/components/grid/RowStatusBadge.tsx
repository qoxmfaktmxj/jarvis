"use client";
import { cn } from "@/lib/utils";
import type { RowStatus } from "./types";

const STYLES: Record<RowStatus, string> = {
  clean: "",
  new: "bg-blue-100 text-blue-700",
  dirty: "bg-amber-100 text-amber-700",
  deleted: "bg-rose-100 text-rose-700",
};

// 라벨은 항상 한글 2자로 통일 — 좁은 상태 컬럼에서 세로 줄바꿈 방지 + 시각적 일관성.
const LABELS: Record<RowStatus, string> = {
  clean: "",
  new: "입력",
  dirty: "수정",
  deleted: "삭제",
};

export function RowStatusBadge({ state }: { state: RowStatus }) {
  if (state === "clean") return null;
  return (
    <span
      className={cn(
        // whitespace-nowrap: 좁은 셀에서도 라벨이 세로로 깨지지 않게 강제.
        "inline-block whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-semibold leading-tight",
        STYLES[state],
      )}
    >
      {LABELS[state]}
    </span>
  );
}
