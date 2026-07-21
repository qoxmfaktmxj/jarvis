import type { ReactNode } from "react";
import type { AuthSession } from "@jarvis/auth";
import type { MenuTreeItem } from "@/lib/server/menu-tree";
import { AppShellMain } from "./AppShellMain";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

export function AppShell(props: {
  session: AuthSession;
  menu: MenuTreeItem[];
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-transparent lg:flex">
      <Sidebar items={props.menu} />
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <Topbar session={props.session} />
        <AppShellMain>{props.children}</AppShellMain>
      </div>
    </div>
  );
}
