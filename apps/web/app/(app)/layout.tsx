import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { loadMenuTree } from "@/lib/server/menu-tree";
import { requirePageSession } from "@/lib/server/page-auth";

export default async function AuthenticatedLayout({ children }: { children: ReactNode }) {
  const session = await requirePageSession();
  const menu = await loadMenuTree(session);
  return <AppShell session={session} menu={menu}>{children}</AppShell>;
}
