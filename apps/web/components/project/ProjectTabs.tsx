"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const tabs = [
  { label: "Overview", href: "" },
  { label: "Tasks", href: "/tasks" },
  { label: "Staff", href: "/staff" },
  { label: "Inquiries", href: "/inquiries" },
  { label: "Settings", href: "/settings" }
] as const;

export function ProjectTabs({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const baseHref = `/projects/${projectId}`;

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
