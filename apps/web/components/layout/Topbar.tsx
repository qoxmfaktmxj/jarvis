"use client";

/**
 * Topbar — 52px. 좌측 라우트 라벨, 중앙 커맨드 팔레트 트리거, 우측 테마/알림/Tweaks/유저.
 *
 * 브랜드 Capy는 Sidebar 헤더로 이동했으므로 여기서는 제거.
 * 라우트 라벨은 usePathname 기반 정적 lookup (i18n 불필요).
 */

import { useCallback, useState } from "react";
import { usePathname } from "next/navigation";
import { Bell, Moon, Search, Settings, Sun } from "lucide-react";
import { UserMenu } from "./UserMenu";
import { CommandPalette } from "./CommandPalette";
import { TweaksPanel } from "./TweaksPanel";
import { setTheme, useTheme } from "./uiPrefs";

const ROUTE_LABELS: ReadonlyArray<readonly [string, string]> = [
  ["/dashboard",    "대시보드"],
  ["/ask",          "AI 질문"],
  ["/search",       "검색"],
  ["/wiki",         "위키"],
  ["/knowledge",    "Knowledge Base"],
  ["/projects",     "프로젝트"],
  ["/attendance",   "근태등록"],
  ["/admin",        "관리자"],
  ["/notices",      "공지"],
  ["/infra",        "인프라"],
  ["/architecture", "아키텍처"],
];

function routeLabel(pathname: string): string {
  for (const [prefix, label] of ROUTE_LABELS) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return label;
  }
  return "";
}

export function Topbar({ userName }: { userName: string }) {
  const pathname = usePathname();
  const theme = useTheme();
  const [tweaksOpen, setTweaksOpen] = useState(false);

  const openPalette = useCallback(() => {
    // CommandPalette는 window keydown(⌘K)으로 트리거되는 기존 계약을 유지.
    const evt = new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true });
    window.dispatchEvent(evt);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme]);

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
        <span
          className="text-[13.5px] font-medium"
          style={{ color: "var(--ink)" }}
        >
          {routeLabel(pathname)}
        </span>

        <div className="flex-1" />

        <button
          type="button"
          onClick={openPalette}
          className="flex items-center rounded-lg border text-[13px] transition-colors"
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
          aria-label={theme === "dark" ? "라이트 테마로" : "다크 테마로"}
          className="rounded-lg p-1.5 transition-colors hover:bg-[color:var(--line2)]"
          style={{ color: "var(--muted)" }}
        >
          {theme === "dark" ? (
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

        <button
          type="button"
          onClick={() => setTweaksOpen((v) => !v)}
          aria-label="Tweaks"
          aria-pressed={tweaksOpen}
          className="rounded-lg p-1.5 transition-colors hover:bg-[color:var(--line2)]"
          style={{
            color: tweaksOpen ? "var(--ink)" : "var(--muted)",
            background: tweaksOpen ? "var(--line2)" : "transparent",
          }}
        >
          <Settings className="h-[18px] w-[18px]" aria-hidden />
        </button>

        <div
          aria-hidden
          style={{ width: 1, height: 20, background: "var(--line)" }}
        />

        <UserMenu userName={userName} />
      </header>

      <CommandPalette />
      <TweaksPanel open={tweaksOpen} onClose={() => setTweaksOpen(false)} />
    </>
  );
}
