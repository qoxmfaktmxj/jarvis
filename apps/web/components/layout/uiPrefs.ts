"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_THEME,
  DEFAULT_THEME_COLOR,
  THEME_COLOR_STORAGE_KEY,
  THEME_STORAGE_KEY,
  resolveTheme,
  resolveThemeColor,
  type ThemeColorId,
  type ThemeMode,
} from "./theme-config";

const THEME_EVENT = "jv:theme-change";
const THEME_COLOR_EVENT = "jv:theme-color-change";

function readStoredTheme(): ThemeMode {
  try {
    return resolveTheme(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return DEFAULT_THEME;
  }
}

function readStoredThemeColor(): ThemeColorId {
  try {
    return resolveThemeColor(window.localStorage.getItem(THEME_COLOR_STORAGE_KEY));
  } catch {
    return DEFAULT_THEME_COLOR;
  }
}

export function setTheme(theme: ThemeMode): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage can be unavailable in private browsing; the current page still updates.
  }
  document.documentElement.dataset.theme = theme;
  window.dispatchEvent(new CustomEvent<ThemeMode>(THEME_EVENT, { detail: theme }));
}

export function setThemeColor(color: ThemeColorId): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(THEME_COLOR_STORAGE_KEY, color);
  } catch {
    // Storage can be unavailable in private browsing; the current page still updates.
  }
  document.documentElement.dataset.themeColor = color;
  window.dispatchEvent(new CustomEvent<ThemeColorId>(THEME_COLOR_EVENT, { detail: color }));
}

export function useTheme(): ThemeMode {
  const [theme, setThemeState] = useState<ThemeMode>(DEFAULT_THEME);

  useEffect(() => {
    const initial = readStoredTheme();
    setThemeState(initial);
    document.documentElement.dataset.theme = initial;
    const handleChange = (event: Event) => {
      setThemeState(resolveTheme((event as CustomEvent).detail));
    };
    window.addEventListener(THEME_EVENT, handleChange);
    return () => window.removeEventListener(THEME_EVENT, handleChange);
  }, []);

  return theme;
}

export function useThemeColor(): ThemeColorId {
  const [color, setColorState] = useState<ThemeColorId>(DEFAULT_THEME_COLOR);

  useEffect(() => {
    const initial = readStoredThemeColor();
    setColorState(initial);
    document.documentElement.dataset.themeColor = initial;
    const handleChange = (event: Event) => {
      setColorState(resolveThemeColor((event as CustomEvent).detail));
    };
    window.addEventListener(THEME_COLOR_EVENT, handleChange);
    return () => window.removeEventListener(THEME_COLOR_EVENT, handleChange);
  }, []);

  return color;
}
