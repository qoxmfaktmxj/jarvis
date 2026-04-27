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
        <h2 className="text-display text-xs font-semibold uppercase tracking-[0.12em] text-[--fg-secondary]">
          {t("title")}
        </h2>
        <span className="h-px flex-1 bg-[--border-default]" aria-hidden />
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-[--fg-secondary]">{t("empty")}</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={item.path ?? "/dashboard"}
                className="group inline-flex items-center gap-2 rounded-md border border-[--border-default] bg-card px-3 py-1.5 text-sm text-[--fg-primary] transition-colors duration-150 hover:border-[--brand-primary] hover:bg-[--brand-primary-bg] hover:text-[--brand-primary]"
              >
                <span className="text-display text-[11px] font-semibold text-[--fg-muted] group-hover:text-[--brand-primary]">
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
