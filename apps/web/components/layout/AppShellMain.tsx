"use client";

import { usePathname } from "next/navigation";

/**
 * AppShell main content area — 전역 공통 viewport-fit 프레임.
 *
 * 설계 원칙 (2026-05-16):
 *  1. **viewport-lock**: `<main>`이 `position: fixed; inset: 0 + overflow: hidden`
 *     으로 viewport에 고정. 페이지 자체 스크롤은 wrapper 안에서만 발생.
 *  2. **자식 wrapper viewport-fit**: `h-full overflow-y-auto` — 자연 height
 *     페이지는 wrapper 내부에서 스크롤, viewport-fit 의도 페이지는 `h-full`/
 *     `flex h-full flex-col`로 빈틈없이 채움 (페이지가 직접 `calc(100vh - …)`
 *     쓸 필요 없음).
 *  3. **max-w 사이드바 반응**: `calc(1700px + (220px - var(--sidebar-width)))` —
 *     사이드바 expanded(220px)면 max 1700, rail(60px)면 max 1860. 즉 사이드바
 *     닫은 만큼 컨텐츠 폭이 자동 확장. 화면이 max-w보다 작으면 그냥 그 폭 사용.
 *  4. **최소 padding**: px-4 py-4 (이전 px-8 py-8 = 64px → 32px). 데드 마진 축소.
 *
 * 페이지 측 권장 패턴:
 *  - 자연 height 페이지(기본): 그대로. wrapper의 overflow-y-auto가 처리.
 *  - viewport-fit 페이지(dashboard / admin 그리드 등): 페이지 wrapper에 `h-full`
 *    또는 `flex h-full flex-col` 만 적용. `calc(100vh - …)` 안 써도 됨.
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
          className="mx-auto h-full overflow-y-auto px-4 py-4"
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
