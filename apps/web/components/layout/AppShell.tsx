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
    <div className="min-h-screen bg-gray-50">
      <Topbar userName={userName} />
      <Sidebar />
      <main className="min-h-screen pl-[var(--sidebar-width)] pt-[var(--topbar-height)]">
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
