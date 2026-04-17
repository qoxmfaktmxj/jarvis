"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface AdminNavItem {
  href: string;
  label: string;
}

export function AdminNav({ items }: { items: AdminNavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1">
      {items.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={
              active
                ? "rounded-md px-3 py-2 text-sm font-semibold bg-isu-50 text-isu-800 transition-colors"
                : "rounded-md px-3 py-2 text-sm font-medium text-surface-700 transition-colors hover:bg-surface-100 hover:text-surface-900"
            }
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
