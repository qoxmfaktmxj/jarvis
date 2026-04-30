import { headers } from "next/headers";
import { AppShellMain } from "./AppShellMain";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { UI_PREFS_BOOTSTRAP } from "./uiPrefs";
import type { MenuTreeNode } from "@/lib/server/menu-tree";

/**
 * AppShell — 전역 레이아웃 프레임.
 *  ├─ bootstrap script (localStorage → <html data-sidebar data-theme>, FOUC 방지)
 *  ├─ Sidebar  (fixed, rail=60px / expanded=220px, --sidebar-width 로 연동)
 *  ├─ Topbar   (fixed, 52px; 테마 토글 + 알림 + 유저 메뉴 + CommandPalette)
 *  └─ main     (scrollable, max-w 1400)
 *
 * `menus`는 상위 RSC가 `getVisibleMenuTree(session, "menu")`로 미리 가져온 결과.
 * `actions`는 `getVisibleMenuTree(session, "action")`으로 가져온 CommandPalette용 액션.
 * AppShell은 자체적으로 세션을 모르고, props로 받아 Sidebar/Topbar에 전달만 한다.
 */
export async function AppShell({
  children,
  userName,
  menus,
  actions,
}: {
  children: React.ReactNode;
  userName: string;
  menus: MenuTreeNode[];
  actions: MenuTreeNode[];
}) {
  const headerStore = await headers();
  const nonce = headerStore.get("x-csp-nonce") ?? undefined;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      {/* FOUC 방지: hydration 전 data-sidebar/data-theme 세팅. CSP strict-dynamic 환경에서 nonce 필수.
          suppressHydrationWarning: 브라우저가 CSP 검증 후 nonce 속성을 DOM에서 strip하므로,
          React hydration 시 서버 HTML(nonce="...")과 클라이언트 DOM(nonce="") 비교에서 mismatch가 발생함. */}
      <script
        nonce={nonce}
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: UI_PREFS_BOOTSTRAP }}
      />
      <Sidebar menus={menus} />
      <Topbar userName={userName} menus={menus} actions={actions} />
      <AppShellMain>{children}</AppShellMain>
    </div>
  );
}
