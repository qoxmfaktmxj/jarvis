"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { isAllowedRoutePath } from "@jarvis/shared/constants/routes";
import type { MenuTreeItem } from "@/lib/server/menu-tree";
import { getMenuIcon } from "./icon-map";
import { SearchCommandTrigger, type SearchCommandLabels } from "../search/SearchCommandPaletteClient";

type SidebarMode = "expanded" | "rail";

const SIDEBAR_MODE_STORAGE_KEY = "jarvis.sidebar.mode";

function isAskPathname(pathname: string): boolean {
  return pathname === "/ask" || pathname.startsWith("/ask/");
}

export type SidebarLabels = {
  primary: string;
  productName: string;
  collapseSidebar: string;
  expandSidebar: string;
  goDashboard: string;
};

function readStoredMode(): SidebarMode {
  try {
    return window.localStorage.getItem(SIDEBAR_MODE_STORAGE_KEY) === "rail" ? "rail" : "expanded";
  } catch {
    return "expanded";
  }
}

function DesktopMenuNode({ item, depth = 0, mode }: { item: MenuTreeItem; depth?: number; mode: SidebarMode }) {
  const Icon = getMenuIcon(item.icon);
  const isRail = mode === "rail";

  if (isRail && item.kind === "group") {
    return <>{item.children.map((child) => <DesktopMenuNode key={child.id} item={child} mode={mode} />)}</>;
  }

  const content = (
    <span
      className={`flex min-w-max items-center gap-2 ${isRail ? "lg:justify-center" : ""}`}
      style={isRail ? undefined : { paddingLeft: `${depth * 12}px` }}
    >
      <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
      <span className={isRail ? "lg:hidden" : ""}>{item.label}</span>
    </span>
  );

  return (
    <li>
      {item.kind === "page" && isAllowedRoutePath(item.routePath) ? (
        <Link
          href={item.routePath}
          aria-label={isRail ? item.label : undefined}
          title={isRail ? item.label : undefined}
          className={`block rounded-md px-3 py-2 text-sm text-[var(--fg-secondary)] hover:bg-[var(--bg-surface)] hover:text-[var(--fg-primary)] ${isRail ? "lg:px-0 lg:text-center" : ""}`}
        >
          {content}
        </Link>
      ) : (
        <div className={`px-3 py-2 text-xs font-semibold text-[var(--fg-muted)] ${isRail ? "lg:hidden" : ""}`}>{content}</div>
      )}
      {item.children.length > 0 && !isRail ? (
        <ul className="space-y-1">
          {item.children.map((child) => <DesktopMenuNode key={child.id} item={child} depth={depth + 1} mode={mode} />)}
        </ul>
      ) : null}
    </li>
  );
}

function MobileMenuNode({ item, depth = 0 }: { item: MenuTreeItem; depth?: number }) {
  const Icon = getMenuIcon(item.icon);
  const content = (
    <span className="flex min-w-max items-center gap-2" style={{ paddingLeft: `${depth * 12}px` }}>
      <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
      <span>{item.label}</span>
    </span>
  );

  return (
    <li>
      {item.kind === "page" && isAllowedRoutePath(item.routePath) ? (
        <Link
          href={item.routePath}
          className="block rounded-md px-3 py-2 text-sm text-[var(--fg-secondary)] hover:bg-[var(--bg-surface)] hover:text-[var(--fg-primary)]"
        >
          {content}
        </Link>
      ) : (
        <div className="px-3 py-2 text-xs font-semibold text-[var(--fg-muted)]">{content}</div>
      )}
      {item.children.length > 0 ? (
        <ul className="space-y-1">
          {item.children.map((child) => <MobileMenuNode key={child.id} item={child} depth={depth + 1} />)}
        </ul>
      ) : null}
    </li>
  );
}

export function SidebarClient({
  items,
  labels,
  searchLabels,
}: {
  items: MenuTreeItem[];
  labels: SidebarLabels;
  searchLabels: Pick<SearchCommandLabels, "inputLabel" | "shortcut">;
}) {
  const pathname = usePathname();
  const [mode, setMode] = useState<SidebarMode>("expanded");
  const previousPathname = useRef<string | null>(null);
  const isRail = mode === "rail";

  const updateMode = (nextMode: SidebarMode) => {
    setMode(nextMode);
    try {
      window.localStorage.setItem(SIDEBAR_MODE_STORAGE_KEY, nextMode);
    } catch {
      // Storage can be unavailable in private browsing; the current page still updates.
    }
  };

  useEffect(() => {
    setMode(readStoredMode());
  }, []);

  useEffect(() => {
    if (isAskPathname(pathname) && !isAskPathname(previousPathname.current ?? "")) {
      updateMode("rail");
    }
    previousPathname.current = pathname;
  }, [pathname]);

  return (
    <aside
      className={`border-b border-[var(--border-default)] bg-[var(--bg-page)] transition-[width] lg:sticky lg:top-0 lg:h-screen lg:self-start lg:border-b-0 lg:border-r ${isRail ? "lg:w-[3.75rem]" : "lg:w-64"}`}
    >
      <div className={`flex items-center gap-1 px-4 py-4 ${isRail ? "lg:justify-center lg:px-2" : "lg:justify-between"}`}>
        <Link
          href="/dashboard"
          aria-label={labels.goDashboard}
          className={`text-base font-semibold text-[var(--fg-primary)] ${isRail ? "lg:hidden" : ""}`}
        >
          {labels.productName}
        </Link>
        <button
          type="button"
          onClick={() => updateMode(isRail ? "expanded" : "rail")}
          aria-label={isRail ? labels.expandSidebar : labels.collapseSidebar}
          title={isRail ? labels.expandSidebar : labels.collapseSidebar}
          className="hidden rounded-md p-1 text-[var(--fg-secondary)] hover:bg-[var(--bg-surface)] hover:text-[var(--fg-primary)] lg:inline-flex"
        >
          {isRail ? <PanelLeftOpen aria-hidden="true" className="h-4 w-4" /> : <PanelLeftClose aria-hidden="true" className="h-4 w-4" />}
        </button>
      </div>
      <div className="px-2 pb-2">
        <SearchCommandTrigger labels={searchLabels} collapsed={isRail} />
      </div>
      <nav aria-label={labels.primary} className="overflow-x-auto px-2 pb-3 lg:max-h-[calc(100vh-7.25rem)] lg:overflow-y-auto">
        <ul className="flex gap-1 lg:hidden">
          {items.map((item) => <MobileMenuNode key={item.id} item={item} />)}
        </ul>
        <ul className="hidden lg:block lg:space-y-1">
          {items.map((item) => <DesktopMenuNode key={item.id} item={item} mode={mode} />)}
        </ul>
      </nav>
    </aside>
  );
}
