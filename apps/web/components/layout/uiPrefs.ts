"use client";

/**
 * uiPrefs — 사이드바/테마 사용자 설정 (localStorage + data-* attribute sync)
 *
 * app.jsx Theme context의 경량 대체.
 *  - sidebar: "rail" | "expanded"  (localStorage key "jv.sidebar")
 *  - theme:   "light" | "dark"     (localStorage key "jv.theme")
 *
 * 쓰기:  setSidebar / setTheme — localStorage + <html data-sidebar="..." data-theme="..."> 업데이트 + custom event 발행
 * 읽기:  useSidebar / useTheme — hook. SSR-safe 기본값 (rail / light).
 */

import { useEffect, useState } from "react";

export type SidebarMode = "rail" | "expanded";
export type ThemeMode = "light" | "dark";

const SIDEBAR_KEY = "jv.sidebar";
const THEME_KEY = "jv.theme";
const THEME_COLOR_KEY = "jv.themeColor";
const SIDEBAR_EVENT = "jv:sidebar-change";
const THEME_EVENT = "jv:theme-change";
const THEME_COLOR_EVENT = "jv:theme-color-change";

export const DEFAULT_SIDEBAR: SidebarMode = "expanded";
export const DEFAULT_THEME: ThemeMode = "light";

export const THEME_COLOR_IDS = ["blue", "indigo", "teal", "forest", "graphite"] as const;
export type ThemeColorId = (typeof THEME_COLOR_IDS)[number];
export const DEFAULT_THEME_COLOR: ThemeColorId = "blue";

function isThemeColorId(v: string | null): v is ThemeColorId {
  return v !== null && (THEME_COLOR_IDS as readonly string[]).includes(v);
}

function readThemeColor(): ThemeColorId {
  if (typeof window === "undefined") return DEFAULT_THEME_COLOR;
  const v = window.localStorage.getItem(THEME_COLOR_KEY);
  return isThemeColorId(v) ? v : DEFAULT_THEME_COLOR;
}

function readSidebar(): SidebarMode {
  if (typeof window === "undefined") return DEFAULT_SIDEBAR;
  const v = window.localStorage.getItem(SIDEBAR_KEY);
  return v === "rail" ? "rail" : "expanded";
}

function readTheme(): ThemeMode {
  if (typeof window === "undefined") return DEFAULT_THEME;
  const v = window.localStorage.getItem(THEME_KEY);
  return v === "dark" ? "dark" : "light";
}

export function setSidebar(mode: SidebarMode) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SIDEBAR_KEY, mode);
  document.documentElement.setAttribute("data-sidebar", mode);
  window.dispatchEvent(new CustomEvent<SidebarMode>(SIDEBAR_EVENT, { detail: mode }));
}

export function setTheme(theme: ThemeMode) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(THEME_KEY, theme);
  document.documentElement.setAttribute("data-theme", theme);
  window.dispatchEvent(new CustomEvent<ThemeMode>(THEME_EVENT, { detail: theme }));
}

export function useSidebar(): SidebarMode {
  // SSR-safe initial: "rail" guarantees server HTML renders rail layout
  // (toggle only, no Capy+Jarvis brand). This prevents the truncated
  // Capy+Jarvis bug when CSS --sidebar-width=60px and React-rendered
  // brand collides at 60px. Client useEffect upgrades to actual mode.
  const [mode, setMode] = useState<SidebarMode>("rail");
  useEffect(() => {
    const initial = readSidebar();
    setMode(initial);
    // Defensive: ensure data-sidebar attribute matches state, in case the
    // inline <head> script in layout.tsx was blocked or stripped during
    // hydration. CSS --sidebar-width binds to this attribute.
    document.documentElement.setAttribute("data-sidebar", initial);
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<SidebarMode>).detail;
      if (detail === "rail" || detail === "expanded") setMode(detail);
    };
    window.addEventListener(SIDEBAR_EVENT, handler);
    return () => window.removeEventListener(SIDEBAR_EVENT, handler);
  }, []);
  return mode;
}

export function setThemeColor(color: ThemeColorId) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(THEME_COLOR_KEY, color);
  document.documentElement.setAttribute("data-theme-color", color);
  window.dispatchEvent(new CustomEvent<ThemeColorId>(THEME_COLOR_EVENT, { detail: color }));
}

export function useTheme(): ThemeMode {
  const [theme, setThemeState] = useState<ThemeMode>(DEFAULT_THEME);
  useEffect(() => {
    setThemeState(readTheme());
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<ThemeMode>).detail;
      if (detail === "light" || detail === "dark") setThemeState(detail);
    };
    window.addEventListener(THEME_EVENT, handler);
    return () => window.removeEventListener(THEME_EVENT, handler);
  }, []);
  return theme;
}

export function useThemeColor(): ThemeColorId {
  const [color, setColorState] = useState<ThemeColorId>(DEFAULT_THEME_COLOR);
  useEffect(() => {
    const initial = readThemeColor();
    setColorState(initial);
    document.documentElement.setAttribute("data-theme-color", initial);
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<ThemeColorId>).detail;
      if (isThemeColorId(detail)) setColorState(detail);
    };
    window.addEventListener(THEME_COLOR_EVENT, handler);
    return () => window.removeEventListener(THEME_COLOR_EVENT, handler);
  }, []);
  return color;
}

/**
 * 하이드레이션 전 CSR 첫 페인트에 `<html data-sidebar data-theme data-theme-color>`을 세팅하기 위한 인라인 스크립트.
 * AppShell의 서버 컴포넌트에서 <Script strategy="beforeInteractive">로 주입.
 */
export const UI_PREFS_BOOTSTRAP = `
(function(){try{
  var s=localStorage.getItem('${SIDEBAR_KEY}');
  var t=localStorage.getItem('${THEME_KEY}');
  var c=localStorage.getItem('${THEME_COLOR_KEY}');
  var validColors=${JSON.stringify(THEME_COLOR_IDS)};
  var root=document.documentElement;
  root.setAttribute('data-sidebar', s==='rail'?'rail':'expanded');
  root.setAttribute('data-theme', t==='dark'?'dark':'light');
  root.setAttribute('data-theme-color', validColors.indexOf(c)>=0?c:'${DEFAULT_THEME_COLOR}');
}catch(e){}})();
`.trim();
