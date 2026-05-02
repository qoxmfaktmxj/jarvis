"use client";

/**
 * Topbar — 52px. 좌측 탭 스트립(TabBar), 우측 테마/알림/유저 + 커맨드 팔레트 트리거.
 *
 * 브랜드 Capy는 Sidebar 헤더로 이동했으므로 여기서는 제거.
 * 좌측 라우트 라벨은 탭 기능 도입(2026-05) 시 TabBar로 대체됨.
 */

import { useCallback } from "react";
import { Bell, Moon, Search, Sun } from "lucide-react";
import { UserMenu } from "./UserMenu";
import { CommandPalette } from "./CommandPalette";
import { TabBar } from "./tabs/TabBar";
import { setTheme, useTheme } from "./uiPrefs";
import type { MenuTreeNode } from "@/lib/server/menu-tree";

export function Topbar({
  userName,
  menus,
  actions,
}: {
  userName: string;
  menus: MenuTreeNode[];
  actions: MenuTreeNode[];
}) {
  const theme = useTheme();
  const isDark = theme === "dark";

  const openPalette = useCallback(() => {
    // CommandPalette는 window keydown(⌘K)으로 트리거되는 기존 계약을 유지.
    const evt = new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true });
    window.dispatchEvent(evt);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(isDark ? "light" : "dark");
  }, [isDark]);

  return (
    <>
      <header
        className="fixed right-0 top-0 z-[var(--z-topbar)] flex items-center border-b px-5"
        style={{
          left: "var(--sidebar-width)",
          height: "var(--topbar-height)",
          background: "var(--panel)",
          borderColor: "var(--line)",
          gap: 14,
          transition: "left .2s ease",
        }}
      >
        <div
          className="flex items-stretch h-full"
          style={{ flex: 1, minWidth: 0 }}
        >
          <TabBar />
        </div>

        <button
          type="button"
          onClick={openPalette}
          className="hidden items-center rounded-lg border text-[13px] transition-colors xl:flex"
          style={{
            gap: 10,
            padding: "6px 10px",
            width: 320,
            background: "var(--bg)",
            borderColor: "var(--line)",
            color: "var(--muted)",
          }}
        >
          <Search className="h-4 w-4" aria-hidden />
          <span className="flex-1 text-left">검색하거나 명령을 실행하세요</span>
          <kbd
            className="inline-flex h-5 min-w-[20px] items-center justify-center rounded border px-1.5 text-[11px]"
            style={{
              background: "var(--panel)",
              borderColor: "var(--line)",
              color: "var(--muted)",
              fontFamily: "var(--font-mono)",
            }}
          >
            ⌘
          </kbd>
          <kbd
            className="inline-flex h-5 min-w-[20px] items-center justify-center rounded border px-1.5 text-[11px]"
            style={{
              background: "var(--panel)",
              borderColor: "var(--line)",
              color: "var(--muted)",
              fontFamily: "var(--font-mono)",
            }}
          >
            K
          </kbd>
        </button>

        <button
          type="button"
          onClick={toggleTheme}
          aria-label={isDark ? "라이트 모드로 전환" : "다크 모드로 전환"}
          aria-pressed={isDark}
          className="rounded-lg p-1.5 transition-colors hover:bg-[color:var(--line2)]"
          style={{ color: "var(--muted)" }}
        >
          {isDark ? (
            <Sun className="h-[18px] w-[18px]" aria-hidden />
          ) : (
            <Moon className="h-[18px] w-[18px]" aria-hidden />
          )}
        </button>

        <button
          type="button"
          aria-label="알림"
          className="relative rounded-lg p-1.5 transition-colors hover:bg-[color:var(--line2)]"
          style={{ color: "var(--muted)" }}
        >
          <Bell className="h-[18px] w-[18px]" aria-hidden />
          <span
            aria-hidden
            className="absolute rounded-full"
            style={{
              top: 6,
              right: 6,
              width: 6,
              height: 6,
              background: "var(--accent)",
              border: "2px solid var(--panel)",
            }}
          />
        </button>

        <div
          aria-hidden
          style={{ width: 1, height: 20, background: "var(--line)" }}
        />

        <UserMenu userName={userName} />
      </header>

      <CommandPalette menus={menus} actions={actions} />
    </>
  );
}
