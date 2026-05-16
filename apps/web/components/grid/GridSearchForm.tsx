"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

type Props = {
  /** 필터 입력 필드들. <GridFilterField label="...">에 input/select를 감싸 전달. */
  children: ReactNode;
  /** [조회] 버튼 클릭 콜백. form submit으로도 트리거된다 (Enter 키). */
  onSearch: () => void;
  /**
   * 미저장 변경분 폐기 콜백. 조회 즉시 dirty/new/deleted 행을 clean으로 되돌림.
   * 사용자 확인 없이 즉시 폐기 (silent discard).
   * - useGridState 직접 보유 시: `grid.discardChanges` 전달.
   * - DataGrid 캡슐화 시: `onGridReady` 콜백으로 받은 api ref의 `discardChanges` 전달.
   *
   * Optional: 컨테이너가 미저장 변경 모델을 외부에서 관리하지 않으면 생략한다
   * (이 경우 dirty 행은 [조회] 후에도 보존되며, onSearch가 reset 책임).
   */
  onResetGrid?: () => void;
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
 *
 * **공통 그리드 규칙 — 조회 시 미저장 변경 폐기 (2026-05-12 자동화):**
 * `onResetGrid` prop(optional, 권장)을 통해 [조회] 클릭 즉시 dirty/new/deleted
 * 행을 사용자 확인 없이 폐기한다. 컨테이너가 grid 상태를 외부에서 보유하면
 * `grid.discardChanges`를 그대로 전달. 외부 모델 없이 서버 reload만 의존하는
 * 컨테이너는 생략 가능하나, 이 경우 dirty 행은 [조회] 후에도 잔존한다. 이후
 * `onSearch`가 서버에서 새 데이터를 fetch하고 `grid.reset(serverRows)` /
 * `DataGrid` 내부 reset이 최종 상태를 덮어쓴다.
 *
 * 컨테이너 wire 패턴:
 * - useGridState 직접 보유: `onResetGrid={grid.discardChanges}`
 * - DataGrid 캡슐화: `gridApiRef.current?.discardChanges()` via `onGridReady`
 */
export function GridSearchForm({
  children,
  onSearch,
  onResetGrid,
  isSearching = false,
  searchLabel = "조회",
  searchingLabel = "조회 중…",
}: Props) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onResetGrid?.(); // sync, immediate visual snap-to-clean
        onSearch();   // async fetch; subsequent grid.reset(serverRows)이 덮어씀
      }}
      className="flex flex-wrap items-end gap-3 rounded-md border border-(--border-default) bg-(--bg-page) px-4 py-3"
    >
      <div className="flex flex-1 flex-wrap items-end gap-3">{children}</div>
      <Button type="submit" size="sm" disabled={isSearching}>
        {isSearching ? searchingLabel : searchLabel}
      </Button>
    </form>
  );
}
