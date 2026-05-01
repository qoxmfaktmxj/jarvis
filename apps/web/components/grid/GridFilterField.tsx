"use client";

import type { ReactNode } from "react";

type Props = {
  /** 필드 라벨. */
  label: string;
  /** 입력 위젯 (input/select/date-picker). */
  children: ReactNode;
  /** 선택적 width 오버라이드. */
  className?: string;
};

/**
 * <GridSearchForm> 내부에 배치하는 라벨 + 입력 페어.
 * 그리드 표준 디자인 토큰을 따른다 (라벨 12px medium, 입력 폭 ≥ 140px).
 */
export function GridFilterField({ label, children, className }: Props) {
  return (
    <label
      className={`flex flex-col gap-1 text-[12px] font-medium text-slate-700 ${className ?? ""}`}
    >
      <span>{label}</span>
      <div className="min-w-[140px]">{children}</div>
    </label>
  );
}
