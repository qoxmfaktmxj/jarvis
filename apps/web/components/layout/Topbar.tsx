"use client";

import Link from "next/link";
import { Bell, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { UserMenu } from "./UserMenu";

export function Topbar({ userName }: { userName: string }) {
  const t = useTranslations("Common");
  return (
    <header
      className="fixed left-0 right-0 top-0 z-50 flex h-[var(--topbar-height)] items-center border-b border-surface-200 bg-surface-50 px-5"
    >
      <div className="flex w-[var(--sidebar-width)] items-center gap-2.5 pr-5">
        <Link
          href="/dashboard"
          className="text-display text-xl font-bold tracking-tight text-isu-600"
        >
          Jarvis
        </Link>
        <span className="rounded-md bg-lime-100 px-1.5 py-0.5 text-[0.625rem] font-semibold uppercase tracking-[0.14em] text-lime-700">
          ISU
        </span>
      </div>

      <div className="max-w-lg flex-1">
        <Link
          href="/search"
          className="flex items-center gap-2.5 rounded-lg bg-surface-100 px-4 py-2 text-sm text-surface-500 transition-colors duration-150 hover:bg-surface-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-isu-400"
        >
          <Search className="h-4 w-4" aria-hidden="true" />
          <span>{t("searchKnowledge")}</span>
          <kbd className="ml-auto rounded bg-surface-200 px-1.5 py-0.5 text-xs font-medium text-surface-600">
            /
          </kbd>
        </Link>
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        <button
          type="button"
          aria-label="Notifications"
          className="relative rounded-lg p-2.5 text-surface-500 transition-colors duration-150 hover:bg-surface-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-isu-400"
        >
          <Bell className="h-5 w-5" aria-hidden="true" />
        </button>
        <UserMenu userName={userName} />
      </div>
    </header>
  );
}
