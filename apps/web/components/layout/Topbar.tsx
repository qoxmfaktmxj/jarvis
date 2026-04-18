"use client";

/**
 * Topbar — 브랜드 마크 + 글로벌 검색 트리거 + 유저 메뉴
 *
 * 검색 트리거는 ⌘K 팔레트를 연다. 기존 /search 링크 대신 CommandPalette 오버레이.
 * 알림 버튼은 드롭다운 플레이스홀더 (미구현 시 숨김 가능).
 */

import Link from "next/link";
import { Bell, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { UserMenu } from "./UserMenu";
import { CommandPalette } from "./CommandPalette";
import { Capy } from "./Capy";

export function Topbar({ userName }: { userName: string }) {
  const t = useTranslations("Common");

  const openPalette = () => {
    // 동일한 ⌘K 트리거 — CommandPalette가 window keydown을 듣고 있음.
    const evt = new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true });
    window.dispatchEvent(evt);
  };

  return (
    <>
      <header className="fixed left-0 right-0 top-0 z-[var(--z-topbar)] flex h-[var(--topbar-height)] items-center border-b border-surface-200 bg-surface-50/90 px-4 backdrop-blur-sm">
        <div className="flex w-[var(--sidebar-width)] items-center gap-2 pl-1 pr-4">
          <Link
            href="/dashboard"
            className="text-display flex items-center gap-1.5 text-lg font-bold tracking-tight text-isu-700"
          >
            <Capy name="reading" size={28} priority className="shrink-0" />
            Jarvis
          </Link>
          <span className="rounded-md bg-lime-100 px-1.5 py-0.5 text-[0.625rem] font-semibold uppercase tracking-[0.14em] text-lime-700">
            ISU
          </span>
        </div>

        <div className="flex max-w-xl flex-1 items-center">
          <button
            type="button"
            onClick={openPalette}
            className="flex w-full items-center gap-2.5 rounded-lg border border-surface-200 bg-white px-3.5 py-2 text-sm text-surface-400 transition-colors hover:border-surface-300 hover:bg-surface-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-isu-400"
          >
            <Search className="h-4 w-4" aria-hidden />
            <span className="flex-1 text-left">{t("searchKnowledge")}</span>
            <kbd className="rounded border border-surface-200 bg-surface-50 px-1.5 py-0.5 text-mono-xs text-surface-500">
              ⌘K
            </kbd>
          </button>
        </div>

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            aria-label="Notifications"
            className="relative rounded-lg p-2 text-surface-500 transition-colors hover:bg-surface-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-isu-400"
          >
            <Bell className="h-[18px] w-[18px]" aria-hidden />
            <span
              aria-hidden
              className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-lime-500"
            />
          </button>
          <UserMenu userName={userName} />
        </div>
      </header>

      <CommandPalette />
    </>
  );
}
