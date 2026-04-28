'use client';

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'jv.askSidebar';
const COLLAPSED_VALUE = 'collapsed';
const EXPANDED_VALUE = 'expanded';

/**
 * AskSidebar(좌측 대화 목록) collapse 상태 — localStorage 영구 저장.
 * `/ask` 페이지 전용. 글로벌 nav Sidebar(rail/expanded) 토글과 독립.
 *
 * 반환: [collapsed, setCollapsed]
 *  - SSR 첫 paint은 default(false=expanded)로 시작 (FOUC 방지). useEffect에서 localStorage를 읽어 동기화.
 */
export function useAskSidebarCollapsed(): [boolean, (next: boolean) => void] {
  const [collapsed, setCollapsedState] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === COLLAPSED_VALUE) setCollapsedState(true);
    else if (raw === EXPANDED_VALUE) setCollapsedState(false);
    // unknown values → keep default (false)
  }, []);

  const setCollapsed = useCallback((next: boolean) => {
    setCollapsedState(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, next ? COLLAPSED_VALUE : EXPANDED_VALUE);
    }
  }, []);

  return [collapsed, setCollapsed];
}
