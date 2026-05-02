"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

const TABS = [
  { href: "/sales/charts/marketing", key: "marketing" },
  { href: "/sales/charts/admin",     key: "admin" },
  { href: "/sales/charts/sales",     key: "sales" },
  { href: "/sales/charts/upload",    key: "upload" },
  { href: "/sales/charts/dashboard", key: "dashboard" },
] as const;

export function ChartsTopbar() {
  const pathname = usePathname();
  const t = useTranslations("Sales.Charts.Topbar");
  return (
    <nav className="border-b border-slate-200 bg-white">
      <ul className="flex items-center gap-1 px-4">
        {TABS.map((tab) => {
          const active = pathname?.startsWith(tab.href) ?? false;
          return (
            <li key={tab.key}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={[
                  "inline-block px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "text-blue-600 border-b-2 border-blue-500"
                    : "text-slate-600 hover:text-slate-900",
                ].join(" ")}
              >
                {t(tab.key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
