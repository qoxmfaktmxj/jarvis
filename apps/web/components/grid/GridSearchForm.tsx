"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

type Props = {
  /** 필터 입력 필드들. <GridFilterField label="...">에 input/select를 감싸 전달. */
  children: ReactNode;
  /** [조회] 버튼 클릭 콜백. form submit으로도 트리거된다 (Enter 키). */
  onSearch: () => void;
  /** 조회 진행 중이면 버튼 disabled + 라벨 토글. */
  isSearching?: boolean;
  searchLabel?: string;
  searchingLabel?: string;
};

/**
 * 그리드 상단 검색 필터 패널.
 * 좌측: 필터 필드들 (자유 배치, flex-wrap)
 * 우측 끝: [조회] 버튼
 *
 * 자동 적용(per-column filter row)과 다르게 사용자가 [조회]를 눌러야 호출된다.
 * 도메인 GridContainer는 children에 <GridFilterField>로 감싼 input/select를 전달.
 */
export function GridSearchForm({
  children,
  onSearch,
  isSearching = false,
  searchLabel = "조회",
  searchingLabel = "조회 중…",
}: Props) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSearch();
      }}
      className="flex flex-wrap items-end gap-3 rounded-md border border-slate-200 bg-slate-50 px-4 py-3"
    >
      <div className="flex flex-1 flex-wrap items-end gap-3">{children}</div>
      <Button type="submit" size="sm" className="rounded" disabled={isSearching}>
        {isSearching ? searchingLabel : searchLabel}
      </Button>
    </form>
  );
}
