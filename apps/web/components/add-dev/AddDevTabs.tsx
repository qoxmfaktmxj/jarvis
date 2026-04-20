"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const tabs = [
  { label: "개요", href: "" },
  { label: "공수", href: "/effort" },
  { label: "매출", href: "/revenue" },
  { label: "투입인력", href: "/staff" },
  { label: "수정", href: "/edit" },
] as const;

export function AddDevTabs({ id }: { id: string }) {
  const pathname = usePathname();
  const baseHref = `/add-dev/${id}`;

  return (
    <nav className="flex gap-1 border-b border-surface-200">
      {tabs.map((tab) => {
        const href = tab.href ? `${baseHref}${tab.href}` : baseHref;
        const active = pathname === href;

        return (
          <Link
            key={tab.label}
            href={href}
            className={cn(
              "border-b-2 px-4 py-2 text-sm font-medium transition-colors",
              active
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-surface-500 hover:border-surface-300 hover:text-surface-900",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
