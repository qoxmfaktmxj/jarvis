import { AppShellMain } from "./AppShellMain";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { UI_PREFS_BOOTSTRAP } from "./uiPrefs";

/**
 * AppShell — 전역 레이아웃 프레임.
 *  ├─ bootstrap script (localStorage → <html data-sidebar data-theme>, FOUC 방지)
 *  ├─ Sidebar  (fixed, rail=60px / expanded=220px, --sidebar-width 로 연동)
 *  ├─ Topbar   (fixed, 52px; Tweaks 버튼 + TweaksPanel 내포)
 *  └─ main     (scrollable, max-w 1400)
 */
export function AppShell({
  children,
  userName,
}: {
  children: React.ReactNode;
  userName: string;
}) {
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      {/* FOUC 방지: hydration 전 data-sidebar/data-theme 세팅. */}
      <script
        dangerouslySetInnerHTML={{ __html: UI_PREFS_BOOTSTRAP }}
      />
      <Sidebar />
      <Topbar userName={userName} />
      <AppShellMain>{children}</AppShellMain>
    </div>
  );
}
