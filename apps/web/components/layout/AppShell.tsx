import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

/**
 * AppShell — 전역 레이아웃 프레임.
 *  ├─ Topbar (fixed, 56px)
 *  ├─ Sidebar (fixed, 248px, 다크)
 *  └─ main (scrollable, max-w 1400)
 */
export function AppShell({
  children,
  userName,
}: {
  children: React.ReactNode;
  userName: string;
}) {
  return (
    <div className="min-h-screen bg-surface-50">
      <Topbar userName={userName} />
      <Sidebar />
      <main
        id="main-content"
        className="min-h-screen pl-[var(--sidebar-width)] pt-[var(--topbar-height)]"
      >
        <div className="mx-auto max-w-[1400px] px-8 py-8">{children}</div>
      </main>
    </div>
  );
}
