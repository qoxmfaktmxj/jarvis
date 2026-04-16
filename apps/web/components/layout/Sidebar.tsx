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
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
        active
          ? "bg-blue-600 text-white"
          : "text-gray-300 hover:bg-gray-700 hover:text-white"
      }`}
    >
      <Icon className="h-5 w-5 shrink-0" />
      {label}
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed bottom-0 left-0 top-[var(--topbar-height)] z-40 flex w-[var(--sidebar-width)] flex-col overflow-y-auto bg-gray-900 text-white">
      <nav className="flex-1 space-y-1 px-3 py-4">
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
      <div className="border-t border-gray-700 px-3 py-4">
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
    </aside>
  );
}
