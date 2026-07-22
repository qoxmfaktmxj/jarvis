"use client";

import { Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { THEME_COLORS } from "./theme-config";
import { setTheme, setThemeColor, useTheme, useThemeColor } from "./uiPrefs";

export function ThemeControls() {
  const t = useTranslations("Theme");
  const theme = useTheme();
  const themeColor = useThemeColor();
  const isDark = theme === "dark";

  return (
    <div className="flex items-center gap-2">
      <div role="radiogroup" aria-label={t("pickerLabel")} className="flex items-center gap-1.5">
        {THEME_COLORS.map(({ id, hex }) => {
          const active = themeColor === id;
          const label = t(`colors.${id}`);
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={label}
              title={label}
              onClick={() => setThemeColor(id)}
              className={`h-4 w-4 rounded-full border border-black/10 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-page)] ${active ? "ring-2 ring-[var(--fg-primary)] ring-offset-2 ring-offset-[var(--bg-page)]" : ""}`}
              style={{ backgroundColor: hex }}
            />
          );
        })}
      </div>
      <span aria-hidden="true" className="h-5 w-px bg-[var(--border-default)]" />
      <button
        type="button"
        onClick={() => setTheme(isDark ? "light" : "dark")}
        aria-label={isDark ? t("switchToLight") : t("switchToDark")}
        aria-pressed={isDark}
        title={isDark ? t("switchToLight") : t("switchToDark")}
        className="rounded-md p-2 text-[var(--fg-secondary)] transition-colors hover:bg-[var(--bg-surface)] hover:text-[var(--fg-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
      >
        {isDark ? <Sun aria-hidden="true" className="h-4 w-4" /> : <Moon aria-hidden="true" className="h-4 w-4" />}
      </button>
    </div>
  );
}
