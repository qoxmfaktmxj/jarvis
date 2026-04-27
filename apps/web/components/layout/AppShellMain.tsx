"use client";

import { usePathname } from "next/navigation";

/**
 * AppShell main content area.
 *
 * Default routes get a centered, max-width 1400px wrapper with px-8/py-8
 * padding (Dashboard, Wiki, etc. — gives content a comfortable reading column).
 *
 * `/ask` is a chat UI and uses full available width: the wrapper is bypassed
 * so AskSidebar can sit flush against the global Sidebar's right edge and
 * the message column can flow viewport-wide.
 */
export function AppShellMain({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const fullWidth = pathname?.startsWith("/ask") ?? false;

  return (
    <main
      id="main-content"
      style={{
        minHeight: "100vh",
        paddingLeft: "var(--sidebar-width)",
        paddingTop: "var(--topbar-height)",
        transition: "padding-left .2s ease",
      }}
    >
      {fullWidth ? children : (
        <div className="mx-auto max-w-[1400px] px-8 py-8">{children}</div>
      )}
    </main>
  );
}
