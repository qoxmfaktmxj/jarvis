import type { ReactNode } from "react";
import type { AuthSession } from "@jarvis/auth";
import type { MenuTreeItem } from "@/lib/server/menu-tree";
import { AppShellMain } from "./AppShellMain";
import { SearchCommandPalette } from "../search/SearchCommandPalette";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

export function AppShell(props: {
  session: AuthSession;
  menu: MenuTreeItem[];
  children: ReactNode;
}) {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-transparent lg:flex-row">
      <Sidebar items={props.menu} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar session={props.session} />
        <AppShellMain>{props.children}</AppShellMain>
      </div>
      <SearchCommandPalette />
    </div>
  );
}
