"use client";

/**
 * Sidebar — rail(60px) / expanded(220px) 2모드.
 *
 * - rail:     아이콘만, 활성은 좌측 3px 인디케이터
 * - expanded: 아이콘 + 라벨, 활성은 bg-line2 pill + 아이콘 옆 3px 인디케이터
 *
 * 모드 전환은 TweaksPanel에서. localStorage 키 `jv.sidebar`.
 * 색상은 app.jsx 디자인 토큰(--panel/--line/--ink/--muted/--line2) 사용.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  Calendar,
  ClipboardList,
  FilePlus,
  GitFork,
  HardDrive,
  LayoutDashboard,
  Library,
  MapPin,
  Megaphone,
  MessageSquare,
  Network,
  Search,
  Server,
  ShieldCheck,
  User,
  type LucideIcon,
} from "lucide-react";
import { Capy } from "./Capy";
import { useSidebar } from "./uiPrefs";

type NavItem = { href: string; label: string; icon: LucideIcon; badge?: string };

const NAV: ReadonlyArray<NavItem> = [
  { href: "/dashboard",             label: "대시보드",      icon: LayoutDashboard },
  { href: "/notices",               label: "공지사항",      icon: Megaphone },
  { href: "/ask",                   label: "AI 질문",       icon: MessageSquare, badge: "AI" },
  { href: "/search",                label: "검색",          icon: Search },
  { href: "/wiki",                  label: "위키",          icon: Library },
  { href: "/wiki/graph",            label: "위키 그래프",   icon: GitFork },
  { href: "/wiki/ingest/manual",    label: "위키 수동수집", icon: FilePlus },
  { href: "/knowledge",             label: "Knowledge",     icon: BookOpen },
  { href: "/projects",              label: "프로젝트",      icon: Server },
  { href: "/architecture",          label: "아키텍처",      icon: Network },
  { href: "/infra",                 label: "인프라",        icon: HardDrive },
  { href: "/add-dev",               label: "추가개발",      icon: ClipboardList },
  { href: "/attendance",            label: "근태등록",      icon: Calendar },
  { href: "/attendance/out-manage", label: "외근관리",      icon: MapPin },
  { href: "/profile",               label: "프로필",        icon: User },
];

const ADMIN: NavItem = { href: "/admin", label: "Admin", icon: ShieldCheck };

// Hrefs that must match exactly to prevent parent from lighting up when a
// more specific sub-route nav item is also in the sidebar (e.g. /wiki vs
// /wiki/graph, /attendance vs /attendance/out-manage).
const EXACT_MATCH_HREFS: ReadonlySet<string> = new Set([
  "/dashboard",
  "/wiki",
  "/attendance",
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
      {/* Brand header */}
      <div
        className="flex items-center border-b"
        style={{
          height: "var(--topbar-height)",
          padding: expanded ? "0 16px" : 0,
          justifyContent: expanded ? "flex-start" : "center",
          borderColor: "var(--line)",
          gap: 8,
        }}
      >
        <Capy name="reading" size={28} priority className="shrink-0 rounded-full" />
        {expanded ? (
          <span
            className="text-display text-[15px] font-bold tracking-tight"
            style={{ color: "var(--ink)" }}
          >
            Jarvis
          </span>
        ) : null}
      </div>

      {/* Nav */}
      <nav
        aria-label="Main"
        className="flex flex-1 flex-col overflow-y-auto"
        style={{ padding: 8, gap: 2 }}
      >
        {NAV.map((item) => (
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
          item={ADMIN}
          active={isActive(pathname, ADMIN.href)}
          expanded={expanded}
        />
      </div>
    </aside>
  );
}
