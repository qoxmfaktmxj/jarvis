"use client";

/**
 * ThemeColorPicker — 5 swatch radio group.
 * UserMenu submenu에서 사용. 클릭 시 document.documentElement.dataset.themeColor
 * 세팅 + localStorage 영속 (uiPrefs.setThemeColor 경유).
 *
 * 5테마는 colors_and_type.css 디자인 킷에서 검증된 라인업:
 *   blue(default Notion Blue) · indigo · teal · forest(보정 #0f6e3a) · graphite
 * Sunset(#dd5b00)은 Warn 상태색과 hex 충돌로 제외 (2026-05-16 결정).
 *
 * 동작:
 * - aria-checked 정확 표시 (현재 선택)
 * - 키보드: APG radiogroup 패턴 — roving tabindex + Arrow/Home/End 키
 * - swatch 색은 hex 하드코딩 (미리보기용 — CSS var 의존 X)
 * - 다크 모드: graphite swatch를 #f5f5f5로 표시 (globals.css 다크 graphite 반전 일치)
 */

import { useRef } from "react";
import { useTranslations } from "next-intl";
import {
  setThemeColor,
  useTheme,
  useThemeColor,
  THEME_COLOR_IDS,
  type ThemeColorId,
} from "./uiPrefs";

const SWATCH_HEX_LIGHT: Record<ThemeColorId, string> = {
  blue: "#0075de",
  indigo: "#5e6ad2",
  teal: "#2a9d99",
  forest: "#0f6e3a",
  graphite: "#171717",
};

const SWATCH_HEX_DARK: Record<ThemeColorId, string> = {
  ...SWATCH_HEX_LIGHT,
  graphite: "#f5f5f5",  // globals.css 다크 graphite 반전과 일치 (#191918 다크 bg 충돌 방지)
};

export function ThemeColorPicker() {
  const t = useTranslations("Theme");
  const current = useThemeColor();
  const theme = useTheme();
  const swatchMap = theme === "dark" ? SWATCH_HEX_DARK : SWATCH_HEX_LIGHT;
  const buttonsRef = useRef<(HTMLButtonElement | null)[]>([]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, idx: number) {
    let nextIdx = idx;
    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
        nextIdx = (idx + 1) % THEME_COLOR_IDS.length;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        nextIdx = (idx - 1 + THEME_COLOR_IDS.length) % THEME_COLOR_IDS.length;
        break;
      case "Home":
        nextIdx = 0;
        break;
      case "End":
        nextIdx = THEME_COLOR_IDS.length - 1;
        break;
      default:
        return;
    }
    e.preventDefault();
    const target = THEME_COLOR_IDS[nextIdx];
    if (target) {
      setThemeColor(target);
      buttonsRef.current[nextIdx]?.focus();
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label={t("picker.aria")}
      className="flex items-center gap-1.5 px-2 py-1.5"
    >
      {THEME_COLOR_IDS.map((id, idx) => {
        const active = current === id;
        const name = t(`colors.${id}`);
        return (
          <button
            key={id}
            ref={(el) => { buttonsRef.current[idx] = el; }}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={name}
            title={name}
            tabIndex={active ? 0 : -1}
            onClick={() => setThemeColor(id)}
            onKeyDown={(e) => handleKeyDown(e, idx)}
            className="rounded-full transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--brand-primary) focus-visible:ring-offset-1"
            style={{
              width: 20,
              height: 20,
              background: swatchMap[id],
              border: active
                ? "2px solid var(--fg-primary)"
                : "1px solid rgba(0,0,0,0.12)",
              boxShadow: active ? "inset 0 0 0 2px white" : "none",
              cursor: "pointer",
            }}
          />
        );
      })}
    </div>
  );
}
