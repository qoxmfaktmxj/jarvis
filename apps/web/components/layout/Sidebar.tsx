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
 *
 * 데이터 소스: 상위 RSC(layout.tsx → AppShell)에서 `getVisibleMenuTree(session,
 * "menu")` 결과를 props로 받는다. RBAC 필터링은 서버에서 끝났으므로 여기서는
 * `code` prefix(`nav.*` / `admin.*`)로 그룹만 분리해 렌더한다.
 *
 * 알려진 상실 기능: 기존 NAV_ITEMS의 `badge`(`nav.ask: "AI"`)는 MenuTreeNode
 * 모델에 없다. badge가 다시 필요하면 menu_item에 컬럼을 추가하거나 사이드카
 * 테이블을 만들어야 한다 (TODO).
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen, type LucideIcon } from "lucide-react";
import { Capy } from "./Capy";
import { setSidebar, useSidebar } from "./uiPrefs";
import { resolveIcon } from "./icon-map";
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
};

/**
 * Defense-in-depth: only accept paths that are unambiguously same-origin
 * absolute paths. Rejects:
 * - empty / null
 * - `javascript:` / `data:` / other non-path schemes
 * - protocol-relative `//evil.com`
 * - relative `foo` (would resolve against current page — surprising)
 *
 * Anyone with write access to `menu_item.routePath` (seed scripts today,
 * future admin/menus UI) MUST NOT be able to inject scripted hrefs.
 */
function isSafeInternalPath(path: string | null | undefined): path is string {
  if (!path) return false;
  if (path.length === 0 || path.length > 300) return false;
  if (!path.startsWith("/")) return false;
  if (path.startsWith("//")) return false;
  return true;
}

/**
 * Adapt a `MenuTreeNode` into the shape NavButton consumes. Returns null for
 * nodes without a `routePath` (group-only rows) and for nodes whose route is
 * not a safe internal path.
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
  return {
    code: node.code,
    href: node.routePath,
    label: node.label,
    Icon: resolveIcon(node.icon),
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
  const { Icon, href, label } = item;
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
      {/* TODO: badge support — MenuTreeNode 모델에는 badge 필드가 없다.
          기존 NAV_ITEMS의 `nav.ask: "AI"` 뱃지가 사라졌다. menu_item.badge
          컬럼이나 사이드카 테이블을 추가하면 부활시킬 수 있다. */}
    </Link>
  );
}

export function Sidebar({ menus }: { menus: MenuTreeNode[] }) {
  const pathname = usePathname();
  const mode = useSidebar();
  const expanded = mode === "expanded";

  // Dev-only: warn if MENU_SEEDS ever introduces `parent_id` rows. Sidebar
  // currently renders flat (no submenu UI). Children would be silently dropped.
  if (process.env.NODE_ENV !== "production") {
    if (menus.some((m) => m.children.length > 0)) {
      console.warn(
        "[Sidebar] menu tree contains nested children but Sidebar renders flat. Hierarchical menus will be lost until submenu UI is added.",
      );
    }
  }

  // Convention: code-prefix split. `nav.*` renders in the main nav; `admin.*`
  // renders below the separator. Matches the seed in `packages/db/seed/menus.ts`.
  const navItems = menus
    .filter((m) => m.code.startsWith("nav."))
    .map(toRenderItem)
    .filter((x): x is RenderItem => x !== null);
  const salesItems = menus
    .filter((m) => m.code.startsWith("sales."))
    .map(toRenderItem)
    .filter((x): x is RenderItem => x !== null);
  const adminItems = menus
    .filter((m) => m.code.startsWith("admin."))
    .map(toRenderItem)
    .filter((x): x is RenderItem => x !== null);

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
        {navItems.map((item) => (
          <NavButton
            key={item.code}
            item={item}
            active={isActive(pathname, item.href)}
            expanded={expanded}
          />
        ))}

        {/* Sales group separator + heading — only when at least one sales item visible */}
        {salesItems.length > 0 ? (
          <>
            <div
              aria-hidden
              className="mt-2 border-t"
              style={{ borderColor: "var(--line)", marginInline: -8 }}
            />
            {expanded ? (
              <div
                className="px-2 pt-2 text-[10px] font-semibold uppercase tracking-[0.18em]"
                style={{ color: "var(--muted)" }}
              >
                영업관리
              </div>
            ) : null}
            {salesItems.map((item) => (
              <NavButton
                key={item.code}
                item={item}
                active={isActive(pathname, item.href)}
                expanded={expanded}
              />
            ))}
          </>
        ) : null}

        {/* Admin group separator + heading — only render when at least one
            admin item is visible (viewer roles otherwise see an orphan
            divider). */}
        {adminItems.length > 0 ? (
          <>
            <div
              aria-hidden
              className="mt-2 border-t"
              style={{ borderColor: "var(--line)", marginInline: -8 }}
            />
            {expanded ? (
              <div
                className="px-2 pt-2 text-[10px] font-semibold uppercase tracking-[0.18em]"
                style={{ color: "var(--muted)" }}
              >
                관리자
              </div>
            ) : null}
            {adminItems.map((item) => (
              <NavButton
                key={item.code}
                item={item}
                active={isActive(pathname, item.href)}
                expanded={expanded}
              />
            ))}
          </>
        ) : null}
      </nav>
    </aside>
  );
}
