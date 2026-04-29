"use client";

/**
 * Sidebar — rail(60px) / expanded(220px) 2모드.
 *
 * - rail:     아이콘만, 활성은 좌측 3px 인디케이터. 헤더는 토글 버튼만.
 * - expanded: 아이콘 + 라벨, 활성은 bg-line2 pill + 아이콘 옆 3px 인디케이터.
 *             헤더는 [Capy + "Jarvis"] 좌측, 토글 버튼 우측 끝.
 *
 * 모드 전환은 헤더의 토글 버튼. localStorage 키 `jv.sidebar`.
 * 색상은 app.jsx 디자인 토큰(--panel/--line/--ink/--muted/--line2) 사용.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Capy } from "./Capy";
import { setSidebar, useSidebar } from "./uiPrefs";
import { NAV_ITEMS, ADMIN_ITEM, type NavItem } from "@/lib/routes";

// Hrefs that must match exactly to prevent parent from lighting up when a
// more specific sub-route nav item is also in the sidebar (e.g. /wiki vs
// /wiki/graph).
const EXACT_MATCH_HREFS: ReadonlySet<string> = new Set([
  "/dashboard",
  "/wiki",
]);

function isActive(pathname: string, href: string): boolean {
  if (EXACT_MATCH_HREFS.has(href)) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavButton({
  item,
  active,
  expanded,
}: {
  item: NavItem;
  active: boolean;
  expanded: boolean;
}) {
  const { icon: Icon, href, label, badge } = item;
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      title={!expanded ? label : undefined}
      className="group relative flex items-center rounded-lg transition-colors"
      style={{
        gap: 10,
        padding: expanded ? "7px 10px" : "9px 0",
        justifyContent: expanded ? "flex-start" : "center",
        color: active ? "var(--ink)" : "var(--muted)",
        background: active && expanded ? "var(--line2)" : "transparent",
        fontWeight: active ? 500 : 400,
        fontSize: 13.5,
      }}
    >
      {active && !expanded ? (
        <span
          aria-hidden
          className="absolute"
          style={{
            left: 6,
            top: "50%",
            transform: "translateY(-50%)",
            width: 3,
            height: 14,
            background: "var(--ink)",
            borderRadius: 2,
          }}
        />
      ) : null}
      <span className="inline-flex shrink-0">
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      {expanded ? <span className="truncate">{label}</span> : null}
      {expanded && badge ? (
        <span
          className="ml-auto inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
          style={{ background: "var(--accent-tint)", color: "var(--accent-ink)" }}
        >
          {badge}
        </span>
      ) : null}
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const mode = useSidebar();
  const expanded = mode === "expanded";

  return (
    <aside
      aria-label="Primary navigation"
      className="fixed bottom-0 left-0 top-0 z-[var(--z-sidebar)] flex flex-col overflow-hidden border-r"
      style={{
        width: "var(--sidebar-width)",
        background: "var(--panel)",
        borderColor: "var(--line)",
        transition: "width .2s ease",
      }}
    >
      {/* Brand header — expanded: [Capy + Jarvis] 좌측, toggle 우측 끝. rail: toggle만 가운데. */}
      <div
        className="flex items-center border-b"
        style={{
          height: "var(--topbar-height)",
          padding: expanded ? "0 8px 0 16px" : 0,
          justifyContent: expanded ? "flex-start" : "center",
          borderColor: "var(--line)",
          gap: 8,
        }}
      >
        {expanded ? (
          <Link
            href="/dashboard"
            aria-label="Dashboard"
            className="flex items-center transition-opacity hover:opacity-80"
            style={{ gap: 8 }}
          >
            <Capy name="reading" size={28} priority className="shrink-0 rounded-full" />
            <span
              className="text-display text-[15px] font-bold tracking-tight"
              style={{ color: "var(--ink)" }}
            >
              Jarvis
            </span>
          </Link>
        ) : null}
        <button
          type="button"
          onClick={() => setSidebar(expanded ? "rail" : "expanded")}
          aria-label={expanded ? "사이드바 접기" : "사이드바 펼치기"}
          aria-pressed={!expanded}
          className="rounded-lg p-1.5 transition-colors hover:bg-[color:var(--line2)]"
          style={{
            color: "var(--muted)",
            marginLeft: expanded ? "auto" : undefined,
          }}
        >
          {expanded ? (
            <PanelLeftClose className="h-[18px] w-[18px]" aria-hidden />
          ) : (
            <PanelLeftOpen className="h-[18px] w-[18px]" aria-hidden />
          )}
        </button>
      </div>

      {/* Nav */}
      <nav
        aria-label="Main"
        className="flex flex-1 flex-col overflow-y-auto"
        style={{ padding: 8, gap: 2 }}
      >
        {NAV_ITEMS.map((item) => (
          <NavButton
            key={item.href}
            item={item}
            active={isActive(pathname, item.href)}
            expanded={expanded}
          />
        ))}
      </nav>

      {/* Footer (Admin) */}
      <div
        className="border-t"
        style={{ padding: 8, borderColor: "var(--line)" }}
      >
        <NavButton
          item={ADMIN_ITEM}
          active={isActive(pathname, ADMIN_ITEM.href)}
          expanded={expanded}
        />
      </div>
    </aside>
  );
}
