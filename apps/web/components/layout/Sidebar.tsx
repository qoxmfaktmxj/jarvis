"use client";

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
  Search,
  Server,
  ShieldCheck
} from "lucide-react";

const navItems: ReadonlyArray<{
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
}> = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/systems", label: "Systems", icon: Server },
  { href: "/knowledge", label: "Knowledge", icon: BookOpen },
  { href: "/wiki", label: "Wiki", icon: Library },
  { href: "/notices", label: "Notices", icon: Megaphone },
  { href: "/search", label: "Search", icon: Search },
  { href: "/ask", label: "Ask AI", icon: MessageSquare },
  { href: "/attendance", label: "Attendance", icon: Calendar }
];

const adminItems: ReadonlyArray<{
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
}> = [{ href: "/admin", label: "Admin", icon: ShieldCheck }];

function NavLink({
  href,
  label,
  active,
  Icon
}: {
  href: string;
  label: string;
  active: boolean;
  Icon: typeof LayoutDashboard;
}) {
  const base =
    "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-[0.8125rem] font-medium transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-lime-400/70";
  const state = active
    ? "bg-lime-100 text-isu-900"
    : "text-isu-200/80 hover:bg-isu-900 hover:text-surface-50";

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`${base} ${state}`}
    >
      {active && (
        <span
          aria-hidden="true"
          className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-lime-500"
        />
      )}
      <Icon
        className={`h-[18px] w-[18px] shrink-0 ${active ? "text-lime-600" : ""}`}
      />
      {label}
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      aria-label="Primary navigation"
      className="fixed bottom-0 left-0 top-[var(--topbar-height)] z-40 flex w-[var(--sidebar-width)] flex-col overflow-y-auto bg-isu-950 text-surface-200"
    >
      <nav aria-label="Main" className="flex-1 space-y-0.5 px-3 py-5">
        {navItems.map(({ href, label, icon: Icon }) => (
          <NavLink
            key={href}
            href={href}
            label={label}
            Icon={Icon}
            active={pathname.startsWith(href)}
          />
        ))}
      </nav>
      <div className="border-t border-isu-900/80 px-3 py-4">
        {adminItems.map(({ href, label, icon: Icon }) => (
          <NavLink
            key={href}
            href={href}
            label={label}
            Icon={Icon}
            active={pathname.startsWith(href)}
          />
        ))}
      </div>
      <footer
        aria-label="Brand"
        className="border-t border-isu-900/80 px-5 pb-5 pt-4"
      >
        <div
          className="text-display flex items-baseline gap-0.5 text-4xl font-bold leading-none tracking-tight text-surface-50"
          aria-label="ISU"
        >
          <span>IS</span>
          <span>U</span>
          <span
            aria-hidden="true"
            className="ml-0.5 inline-block h-2 w-2 translate-y-[-2px] rounded-full bg-lime-500"
          />
        </div>
        <p className="mt-2 text-[0.625rem] font-semibold uppercase tracking-[0.18em] text-isu-300/70">
          이수시스템 · Internal Portal
        </p>
      </footer>
    </aside>
  );
}
