import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSession } from "@jarvis/auth/session";
import { AppShell } from "@/components/layout/AppShell";
import { getVisibleMenuTree } from "@/lib/server/menu-tree";

export default async function AppLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const headerStore = await headers();
  const cookieStore = await cookies();

  const sessionId =
    headerStore.get("x-session-id") ??
    cookieStore.get("sessionId")?.value ??
    cookieStore.get("jarvis_session")?.value;

  if (!sessionId) {
    redirect("/login");
  }

  const session = await getSession(sessionId);
  if (!session) {
    redirect("/login");
  }

  // RBAC menu tree (Task 4/5) — sidebar + CommandPalette 데이터를 RSC 단계에서 한 번만 가져온다.
  // 헬퍼는 DB 오류 시 빈 배열로 graceful degrade하므로 상단 try/catch 불필요.
  const [menus, actions] = await Promise.all([
    getVisibleMenuTree(session, "menu"),
    getVisibleMenuTree(session, "action"),
  ]);

  return (
    <AppShell userName={session.name} menus={menus} actions={actions}>
      {children}
    </AppShell>
  );
}
