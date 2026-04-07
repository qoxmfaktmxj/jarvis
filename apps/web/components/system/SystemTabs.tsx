"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const tabs = [
  { label: "Overview", href: "" },
  { label: "Access", href: "/access" },
  { label: "Deploy", href: "/deploy" },
  { label: "Runbook", href: "/runbook" }
] as const;

export function SystemTabs({ systemId }: { systemId: string }) {
  const pathname = usePathname();
  const baseHref = `/systems/${systemId}`;

  return (
    <nav className="flex gap-1 border-b border-gray-200">
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
                : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-900"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
