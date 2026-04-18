"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ListChecks,
  Users,
  MessageSquare,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { label: "Overview", href: "", Icon: LayoutDashboard },
  { label: "Tasks", href: "/tasks", Icon: ListChecks },
  { label: "Staff", href: "/staff", Icon: Users },
  { label: "Inquiries", href: "/inquiries", Icon: MessageSquare },
  { label: "Settings", href: "/settings", Icon: Settings },
] as const;

export function ProjectTabs({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const baseHref = `/projects/${projectId}`;

  return (
    <nav
      className="flex gap-0.5 border-b border-surface-200"
      aria-label="Project sections"
    >
      {tabs.map((tab) => {
        const href = tab.href ? `${baseHref}${tab.href}` : baseHref;
        const active = pathname === href;
        const { Icon } = tab;

        return (
          <Link
            key={tab.label}
            href={href}
            role="tab"
            aria-selected={active}
            className={cn(
              "relative inline-flex items-center gap-1.5 border-b-2 px-3.5 py-2.5 text-[13px] font-medium transition-colors -mb-px",
              active
                ? "border-isu-500 text-isu-700"
                : "border-transparent text-surface-500 hover:border-surface-300 hover:text-surface-900",
            )}
          >
            <Icon
              className={cn(
                "h-3.5 w-3.5",
                active ? "text-isu-500" : "text-surface-400",
              )}
            />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
