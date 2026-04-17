"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { MenuItem } from "@/lib/queries/dashboard";

/**
 * QuickLinksWidget — flow layout.
 * Horizontal chip row. No card, no border box. Chips wrap on overflow.
 */
export function QuickLinksWidget({ items }: { items: MenuItem[] }) {
  const t = useTranslations("Dashboard.QuickLinks");

  return (
    <section aria-label={t("title")}>
      <div className="mb-3 flex items-baseline gap-3">
        <h2 className="text-display text-xs font-semibold uppercase tracking-[0.12em] text-surface-500">
          {t("title")}
        </h2>
        <span className="h-px flex-1 bg-surface-200" aria-hidden />
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-surface-500">{t("empty")}</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={item.path ?? "/dashboard"}
                className="group inline-flex items-center gap-2 rounded-md border border-surface-200 bg-card px-3 py-1.5 text-sm text-surface-700 transition-colors duration-150 hover:border-isu-300 hover:bg-isu-50 hover:text-isu-700"
              >
                <span className="text-display text-[11px] font-semibold text-surface-400 group-hover:text-isu-500">
                  {item.label.slice(0, 1).toUpperCase()}
                </span>
                <span className="font-medium">{item.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
