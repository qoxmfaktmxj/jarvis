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
 * - 키보드: Tab으로 swatch 간 이동, Space/Enter 선택 (button 기본)
 * - swatch 색은 hex 하드코딩 (미리보기용 — CSS var 의존 X)
 */

import { useTranslations } from "next-intl";
import {
  setThemeColor,
  useThemeColor,
  THEME_COLOR_IDS,
  type ThemeColorId,
} from "./uiPrefs";

const SWATCH_HEX: Record<ThemeColorId, string> = {
  blue: "#0075de",
  indigo: "#5e6ad2",
  teal: "#2a9d99",
  forest: "#0f6e3a",
  graphite: "#171717",
};

export function ThemeColorPicker() {
  const t = useTranslations("Theme");
  const current = useThemeColor();

  return (
    <div
      role="radiogroup"
      aria-label={t("picker.aria")}
      className="flex items-center gap-1.5 px-2 py-1.5"
    >
      {THEME_COLOR_IDS.map((id) => {
        const active = current === id;
        const name = t(`colors.${id}`);
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={name}
            title={name}
            onClick={() => setThemeColor(id)}
            className="rounded-full transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--brand-primary) focus-visible:ring-offset-1"
            style={{
              width: 20,
              height: 20,
              background: SWATCH_HEX[id],
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
