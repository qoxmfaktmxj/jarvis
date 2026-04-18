"use client";

/**
 * Sidebar — 그룹화된 내비게이션, 한 레벨 섹션 구분.
 *
 * 구조:
 *   Workspace (Dashboard, Ask AI, Search)
 *   Knowledge (Wiki, Knowledge, Notices)
 *   Build     (Projects, Systems, Infra, Architecture)
 *   Me        (Attendance)
 *   ─────
 *   Admin     (권한 있을 때만)
 *
 * 시각: 다크 사이드바, ISU Blue-950 바탕, 라임 액티브 바.
 * 푸터: ISU 브랜드 마크.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  Calendar,
  FolderKanban,
  LayoutDashboard,
  Library,
  Megaphone,
  MessageSquare,
  Network,
  Search,
  Server,
  ShieldCheck,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: LucideIcon };
type NavGroup = { id: string; label: string; items: ReadonlyArray<NavItem> };

const GROUPS: ReadonlyArray<NavGroup> = [
  {
    id: "workspace",
    label: "Workspace",
    items: [
      { href: "/dashboard", label: "대시보드", icon: LayoutDashboard },
      { href: "/ask",       label: "Ask AI",   icon: MessageSquare },
      { href: "/search",    label: "검색",     icon: Search },
    ],
  },
  {
    id: "knowledge",
    label: "Knowledge",
    items: [
      { href: "/wiki",      label: "위키",       icon: Library },
      { href: "/knowledge", label: "지식 베이스", icon: BookOpen },
      { href: "/notices",   label: "공지",       icon: Megaphone },
    ],
  },
  {
    id: "build",
    label: "Build",
    items: [
      { href: "/projects",     label: "프로젝트",   icon: FolderKanban },
      { href: "/systems",      label: "시스템",     icon: Server },
      { href: "/infra",        label: "인프라",     icon: Network },
      { href: "/architecture", label: "아키텍처",   icon: Workflow },
    ],
  },
  {
    id: "me",
    label: "Me",
    items: [
      { href: "/attendance", label: "근태", icon: Calendar },
    ],
  },
];

const ADMIN_ITEM: NavItem = { href: "/admin", label: "관리자", icon: ShieldCheck };

function NavLink({ href, label, active, icon: Icon }: NavItem & { active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[0.8125rem] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-lime-400/70",
        active
          ? "bg-[color:var(--color-sidebar-active)] font-semibold text-white"
          : "font-medium text-[color:var(--color-sidebar-foreground)] hover:bg-[color:var(--color-sidebar-hover)] hover:text-white"
      )}
    >
      {active ? (
        <span
          aria-hidden
          className="absolute left-0 top-1/2 h-5 w-0.5 -translate-x-2 -translate-y-1/2 rounded-r bg-lime-400"
        />
      ) : null}
      <Icon
        className={cn(
          "h-[17px] w-[17px] shrink-0",
          active ? "text-lime-400" : "text-[color:var(--color-sidebar-muted)] group-hover:text-white"
        )}
        aria-hidden
      />
      <span className="truncate">{label}</span>
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <aside
      aria-label="Primary navigation"
      className="fixed bottom-0 left-0 top-[var(--topbar-height)] z-[var(--z-sidebar)] flex w-[var(--sidebar-width)] flex-col overflow-y-auto bg-[color:var(--color-sidebar)] text-[color:var(--color-sidebar-foreground)]"
    >
      <nav aria-label="Main" className="flex-1 px-3 py-4">
        {GROUPS.map((group) => (
          <div key={group.id} className="mb-5 last:mb-0">
            <p className="mb-1.5 px-3 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-[color:var(--color-sidebar-muted)]">
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((it) => (
                <li key={it.href}>
                  <NavLink {...it} active={isActive(it.href)} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-[color:var(--color-sidebar-border)] px-3 py-3">
        <NavLink {...ADMIN_ITEM} active={isActive(ADMIN_ITEM.href)} />
      </div>

      <footer
        aria-label="Brand"
        className="border-t border-[color:var(--color-sidebar-border)] px-5 pb-5 pt-4"
      >
        <div
          className="text-display flex items-baseline gap-0.5 text-3xl font-bold leading-none tracking-tight text-white"
          aria-label="ISU"
        >
          <span>IS</span>
          <span>U</span>
          <span
            aria-hidden
            className="ml-1 inline-block h-[7px] w-[7px] translate-y-[-2px] rounded-full bg-lime-400"
          />
        </div>
        <p className="mt-2 text-[0.625rem] font-semibold uppercase tracking-[0.16em] text-[color:var(--color-sidebar-muted)]">
          이수시스템 · Internal Portal
        </p>
      </footer>
    </aside>
  );
}
