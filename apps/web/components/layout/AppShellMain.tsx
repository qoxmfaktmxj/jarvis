"use client";

import { usePathname } from "next/navigation";

/**
 * AppShell main content area — 전역 공통 viewport-fit 프레임.
 *
 * 설계 원칙 (2026-05-16):
 *  1. **viewport-lock**: `<main>`이 `position: fixed; inset: 0 + overflow: hidden`
 *     으로 viewport에 고정. 페이지 스크롤은 PageShell이 책임.
 *  2. **wrapper도 `overflow-hidden`**: 페이지가 자체적으로 스크롤 영역을 정의해야
 *     한다 — PageShellFit는 자체 overflow-hidden (페이지 스크롤 X, 내부 위젯만
 *     스크롤), PageShell은 자체 overflow-y-auto (페이지 내부 자체 스크롤). 둘 다
 *     `h-full`로 wrapper 사이즈에 정확히 fit.
 *  3. **max-w 사이드바 반응**: `calc(1700px + (220px - var(--sidebar-width)))` —
 *     사이드바 expanded(220px)면 max 1700, rail(60px)면 max 1860. 즉 사이드바
 *     닫은 만큼 컨텐츠 폭이 자동 확장. 화면이 max-w보다 작으면 그냥 그 폭 사용.
 *  4. **최소 padding**: px-4 + pt-1.5 (위 6px) + pb-[3px] (아래 3px, 위의 50%).
 *
 * 페이지 측 권장 패턴:
 *  - 자연 height 페이지: `<PageShell title>{...}</PageShell>`
 *  - viewport-fit 페이지: `<PageShellFit title>{...}</PageShellFit>`
 *  - 페이지에서 직접 `mx-auto` / `max-w-[...]` / `px-*` / `py-*` /
 *    `style={{height: 'calc(100vh - …)'}}` 사용 금지.
 *
 * `/ask`는 채팅 UI라 wrapper 자체를 bypass — sidebar 우측 flush 정렬 위해.
 */
export function AppShellMain({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const fullWidth = pathname?.startsWith("/ask") ?? false;

  return (
    <main
      id="main-content"
      className="overflow-hidden"
      style={{
        position: "fixed",
        inset: 0,
        paddingLeft: "var(--sidebar-width)",
        paddingTop: "var(--topbar-height)",
        transition: "padding-left .2s ease",
      }}
    >
      {fullWidth ? (
        <div className="h-full w-full overflow-hidden">{children}</div>
      ) : (
        <div
          className="mx-auto h-full overflow-hidden px-4 pt-1.5 pb-[3px]"
          style={{
            maxWidth: "calc(1700px + (220px - var(--sidebar-width)))",
          }}
        >
          {children}
        </div>
      )}
    </main>
  );
}
