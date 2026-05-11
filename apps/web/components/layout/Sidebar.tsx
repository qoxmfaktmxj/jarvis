"use client";

/**
 * Sidebar — rail(60px) / expanded(220px) 2모드.
 *
 * - rail:     아이콘만, 활성은 좌측 3px 인디케이터. 헤더는 토글 버튼만.
 *             그룹 헤더는 숨기고 자식 리프만 평면 렌더.
 * - expanded: 아이콘 + 라벨, 활성은 bg-line2 pill + 아이콘 옆 3px 인디케이터.
 *             헤더는 [Capy + "Jarvis"] 좌측, 토글 버튼 우측 끝.
 *             그룹은 NavGroup으로 collapsible 렌더.
 *
 * 모드 전환은 헤더의 토글 버튼. localStorage 키 `jv.sidebar`.
 * 트리 펼침/접힘은 useNavTreeOpen 훅 (localStorage 키 `jv.sidebar.tree`).
 * 색상은 app.jsx 디자인 토큰(--panel/--line/--ink/--muted/--line2) 사용.
 *
 * 데이터 소스: 상위 RSC(layout.tsx → AppShell)에서 `getVisibleMenuTree(session,
 * "menu")` 결과를 props로 받는다. RBAC 필터링은 서버에서 끝났으므로 여기서는
 * 트리 구조(parent_id 기반)를 재귀 렌더한다. 그룹 헤더는 routePath="" 으로
 * 식별하며, 자식이 모두 보이지 않으면 buildMenuTree에서 prune된다.
 *
 * Badge 지원: `MenuTreeNode.badge` 값이 있으면 라벨 옆 작은 태그를 렌더한다
 * (expanded 모드 한정).
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen, type LucideIcon } from "lucide-react";
import { Capy } from "./Capy";
import { setSidebar, useSidebar } from "./uiPrefs";
import { resolveIcon } from "./icon-map";
import { useTabContext } from "./tabs/TabContext";
import { MAX_TABS } from "./tabs/tab-types";
import { NavGroup } from "./NavGroup";
import { useNavTreeOpen } from "./useNavTreeOpen";
import { isSafeInternalPath } from "@/lib/url";
import type { MenuTreeNode } from "@/lib/server/menu-tree";

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

type RenderItem = {
  code: string;
  href: string;
  label: string;
  Icon: LucideIcon;
  /** Optional sidebar badge text (e.g. "AI"). Empty/null → no badge. */
  badge: string | null;
};

/**
 * Adapt a `MenuTreeNode` into the shape NavButton consumes. Returns null for
 * nodes without a `routePath` (group-only rows) and for nodes whose route is
 * not a safe internal path.
 *
 * Path safety is enforced by `isSafeInternalPath` from `@/lib/url` — the
 * single source of truth for defense-in-depth against `javascript:` / `data:`
 * URI injection via `menu_item.routePath`. Anyone with write access to that
 * column (seed scripts today, future admin/menus UI) MUST NOT be able to
 * inject scripted hrefs.
 */
function toRenderItem(node: MenuTreeNode): RenderItem | null {
  if (!isSafeInternalPath(node.routePath)) {
    if (node.routePath && process.env.NODE_ENV !== "production") {
      console.warn(
        `[Sidebar] dropping menu item with unsafe routePath: code=${node.code} routePath=${JSON.stringify(node.routePath)}`,
      );
    }
    return null;
  }
  // Trim badge so empty-string admin entries don't render a blank pill.
  const trimmedBadge = node.badge?.trim();
  return {
    code: node.code,
    href: node.routePath,
    label: node.label,
    Icon: resolveIcon(node.icon),
    badge: trimmedBadge && trimmedBadge.length > 0 ? trimmedBadge : null,
  };
}

function NavButton({
  item,
  active,
  expanded,
}: {
  item: RenderItem;
  active: boolean;
  expanded: boolean;
}) {
  const { Icon, href, label, badge } = item;
  const router = useRouter();
  const { openTab } = useTabContext();

  const handleClick = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    // Allow modifier-clicks (cmd/ctrl/shift/middle-click) to behave normally —
    // user wants browser default (new tab/window). Don't intercept those.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;

    e.preventDefault();
    const ok = await openTab(href, label);
    if (ok) {
      router.push(href);
    } else if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.warn(
        `[Sidebar] openTab refused for ${href} — likely all ${MAX_TABS} tabs are pinned.`,
      );
    }
  };

  return (
    <Link
      href={href}
      onClick={handleClick}
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
      {/* keep all existing children unchanged: indicator, icon, label, badge */}
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
      {/* Badge — expanded 모드에서만 (rail에서는 라벨이 숨겨지므로 배지도
          생략). menu_item.badge 가 비어 있지 않은 행에만 렌더된다. */}
      {expanded && badge ? (
        <span
          aria-label={`${label} ${badge}`}
          className="ml-auto inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{
            background: "color-mix(in oklab, var(--brand-primary) 14%, transparent)",
            color: "var(--brand-primary)",
          }}
        >
          {badge}
        </span>
      ) : null}
    </Link>
  );
}

type RenderArgs = {
  pathname: string;
  expanded: boolean;
  isOpen: (code: string) => boolean;
  toggle: (code: string) => void;
};

function renderTreeNode(
  node: MenuTreeNode,
  depth: number,
  args: RenderArgs,
): React.ReactNode {
  const { pathname, expanded, isOpen, toggle } = args;
  const isGroup = !node.routePath || node.routePath === "";

  if (!expanded) {
    // Rail mode: flatten leaves only (skip group wrappers).
    if (isGroup) {
      return node.children.map((child) => renderTreeNode(child, depth, args));
    }
    const item = toRenderItem(node);
    if (!item) return null;
    return (
      <NavButton
        key={node.code}
        item={item}
        active={isActive(pathname, item.href)}
        expanded={false}
      />
    );
  }

  if (isGroup) {
    return (
      <NavGroup
        key={node.code}
        label={node.label}
        Icon={resolveIcon(node.icon)}
        open={isOpen(node.code)}
        onToggle={() => toggle(node.code)}
        depth={depth}
      >
        {node.children.map((child) => renderTreeNode(child, depth + 1, args))}
      </NavGroup>
    );
  }

  // Leaf in expanded mode
  const item = toRenderItem(node);
  if (!item) return null;
  return (
    <div key={node.code} style={{ paddingLeft: depth * 12 }}>
      <NavButton item={item} active={isActive(pathname, item.href)} expanded={true} />
    </div>
  );
}

export function Sidebar({ menus }: { menus: MenuTreeNode[] }) {
  const pathname = usePathname();
  const mode = useSidebar();
  const expanded = mode === "expanded";
  const { isOpen, toggle } = useNavTreeOpen({ menus, pathname });

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
      {/* Brand header — UNCHANGED from previous version */}
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

      {/* Tree-rendered nav */}
      <nav
        aria-label="Main"
        className="flex flex-1 flex-col overflow-y-auto"
        style={{ padding: 8, gap: 2 }}
      >
        {menus.map((node) =>
          renderTreeNode(node, 0, { pathname, expanded, isOpen, toggle }),
        )}
      </nav>
    </aside>
  );
}
