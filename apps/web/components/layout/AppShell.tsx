import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

export function AppShell({
  children,
  userName
}: {
  children: React.ReactNode;
  userName: string;
}) {
  return (
    <div className="min-h-screen" style={{ background: "var(--background)" }}>
      <Topbar userName={userName} />
      <Sidebar />
      <main className="min-h-screen pl-[var(--sidebar-width)] pt-[var(--topbar-height)]">
        <div className="mx-auto max-w-[1400px] px-8 py-8">{children}</div>
      </main>
    </div>
  );
}
