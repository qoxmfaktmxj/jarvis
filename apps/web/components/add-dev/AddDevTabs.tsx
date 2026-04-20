"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

const TAB_DEFS = [
  { key: "overview", href: "" },
  { key: "effort", href: "/effort" },
  { key: "revenue", href: "/revenue" },
  { key: "staff", href: "/staff" },
  { key: "edit", href: "/edit" },
] as const;

export function AddDevTabs({ id }: { id: string }) {
  const pathname = usePathname();
  const baseHref = `/add-dev/${id}`;
  const t = useTranslations("AdditionalDev.tabs");

  return (
    <nav className="flex gap-1 border-b border-surface-200">
      {TAB_DEFS.map((tab) => {
        const href = tab.href ? `${baseHref}${tab.href}` : baseHref;
        const active = pathname === href;

        return (
          <Link
            key={tab.key}
            href={href}
            className={cn(
              "border-b-2 px-4 py-2 text-sm font-medium transition-colors",
              active
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-surface-500 hover:border-surface-300 hover:text-surface-900",
            )}
          >
            {t(tab.key)}
          </Link>
        );
      })}
    </nav>
  );
}
