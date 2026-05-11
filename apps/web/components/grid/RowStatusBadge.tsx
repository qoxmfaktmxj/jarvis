"use client";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { RowStatus } from "./types";

const STYLES: Record<RowStatus, string> = {
  clean: "",
  new: "bg-blue-100 text-blue-700",
  dirty: "bg-amber-100 text-amber-700",
  deleted: "bg-rose-100 text-rose-700",
};

// 라벨 키는 항상 한글 2자 폭으로 통일 — 좁은 상태 컬럼에서 세로 줄바꿈 방지 + 시각적 일관성.
// 실제 문자열은 `Common.Grid.RowStatus.{new,dirty,deleted}`에서 가져온다.
const LABEL_KEYS: Record<Exclude<RowStatus, "clean">, "new" | "dirty" | "deleted"> = {
  new: "new",
  dirty: "dirty",
  deleted: "deleted",
};

export function RowStatusBadge({ state }: { state: RowStatus }) {
  const t = useTranslations("Common.Grid.RowStatus");
  if (state === "clean") return null;
  return (
    <span
      className={cn(
        // whitespace-nowrap: 좁은 셀에서도 라벨이 세로로 깨지지 않게 강제.
        "inline-block whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-semibold leading-tight",
        STYLES[state],
      )}
    >
      {t(LABEL_KEYS[state])}
    </span>
  );
}
