'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

export type WikiPanelTarget = { slug: string };

interface WikiPanelContextValue {
  open: (target: WikiPanelTarget) => void;
  close: () => void;
  active: WikiPanelTarget | null;
  /** Split pane이 현재 활성인지 (lg breakpoint + 사용자가 source를 클릭했는지). */
  isOpen: boolean;
  /** Provider 안에서 사용 중인지 여부. WikiLink의 panel 인터셉트 조건 판별에 사용. */
  hasProvider: boolean;
}

const WikiPanelContext = createContext<WikiPanelContextValue | null>(null);

export function WikiPanelProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<WikiPanelTarget | null>(null);

  const value = useMemo<WikiPanelContextValue>(
    () => ({
      active,
      isOpen: active !== null,
      hasProvider: true,
      open: (t) => setActive(t),
      close: () => setActive(null),
    }),
    [active],
  );

  return <WikiPanelContext.Provider value={value}>{children}</WikiPanelContext.Provider>;
}

/**
 * WikiPanelContext consumer.
 * Provider 밖에서 호출하면 no-op fallback을 반환해 AnswerCard가 /wiki 풀페이지 navigate로 fall back할 수 있게 한다 (lg 미만 모바일 path).
 */
export function useWikiPanel(): WikiPanelContextValue {
  const ctx = useContext(WikiPanelContext);
  if (ctx) return ctx;
  return {
    active: null,
    isOpen: false,
    hasProvider: false,
    open: () => {},
    close: () => {},
  };
}
