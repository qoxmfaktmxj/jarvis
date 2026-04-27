"use client";

/**
 * TweaksPanel — fixed floating card (bottom-right).
 *
 * app.jsx `Tweaks`의 재현. 테마(라이트/다크) + 사이드바(레일/펼침) 토글만 노출.
 * 열림/닫힘 상태는 Topbar가 관리. localStorage 쓰기는 uiPrefs 모듈 경유.
 */

import { X } from "lucide-react";
import {
  setSidebar,
  setTheme,
  useSidebar,
  useTheme,
  type SidebarMode,
  type ThemeMode,
} from "./uiPrefs";

type Option<T extends string> = readonly [value: T, label: string];

function Row<T extends string>({
  label,
  options,
  current,
  onSelect,
}: {
  label: string;
  options: ReadonlyArray<Option<T>>;
  current: T;
  onSelect: (value: T) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div
        className="uppercase"
        style={{
          fontSize: 10,
          letterSpacing: ".08em",
          color: "var(--muted)",
          fontFamily: "var(--font-mono)",
        }}
      >
        {label}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {options.map(([value, optLabel]) => {
          const selected = current === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => onSelect(value)}
              style={{
                padding: "6px 10px",
                fontSize: 12,
                borderRadius: 6,
                border: `1px solid ${selected ? "var(--ink)" : "var(--line)"}`,
                background: selected ? "var(--ink)" : "var(--panel)",
                color: selected ? "var(--panel)" : "var(--ink2)",
                transition: "background .15s, color .15s, border-color .15s",
              }}
            >
              {optLabel}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const THEME_OPTIONS: ReadonlyArray<Option<ThemeMode>> = [
  ["light", "라이트"],
  ["dark", "다크"],
];

const SIDEBAR_OPTIONS: ReadonlyArray<Option<SidebarMode>> = [
  ["rail", "아이콘"],
  ["expanded", "펼침"],
];

export function TweaksPanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const theme = useTheme();
  const sidebar = useSidebar();

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-label="Tweaks"
      style={{
        position: "fixed",
        bottom: 20,
        right: 20,
        width: 280,
        zIndex: 60,
        background: "var(--panel)",
        border: "1px solid var(--line)",
        borderRadius: 12,
        boxShadow: "var(--shadow-lg)",
        padding: 14,
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center" }}>
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          style={{ color: "var(--muted)", padding: 4 }}
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <Row label="테마" options={THEME_OPTIONS} current={theme} onSelect={setTheme} />
      <Row label="사이드바" options={SIDEBAR_OPTIONS} current={sidebar} onSelect={setSidebar} />
    </div>
  );
}
