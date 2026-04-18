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
const SIDEBAR_EVENT = "jv:sidebar-change";
const THEME_EVENT = "jv:theme-change";

export const DEFAULT_SIDEBAR: SidebarMode = "rail";
export const DEFAULT_THEME: ThemeMode = "light";

function readSidebar(): SidebarMode {
  if (typeof window === "undefined") return DEFAULT_SIDEBAR;
  const v = window.localStorage.getItem(SIDEBAR_KEY);
  return v === "expanded" ? "expanded" : "rail";
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
  const [mode, setMode] = useState<SidebarMode>(DEFAULT_SIDEBAR);
  useEffect(() => {
    setMode(readSidebar());
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<SidebarMode>).detail;
      if (detail === "rail" || detail === "expanded") setMode(detail);
    };
    window.addEventListener(SIDEBAR_EVENT, handler);
    return () => window.removeEventListener(SIDEBAR_EVENT, handler);
  }, []);
  return mode;
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

/**
 * 하이드레이션 전 CSR 첫 페인트에 `<html data-sidebar data-theme>`을 세팅하기 위한 인라인 스크립트.
 * AppShell의 서버 컴포넌트에서 <Script strategy="beforeInteractive">로 주입.
 */
export const UI_PREFS_BOOTSTRAP = `
(function(){try{
  var s=localStorage.getItem('${SIDEBAR_KEY}');
  var t=localStorage.getItem('${THEME_KEY}');
  var root=document.documentElement;
  root.setAttribute('data-sidebar', s==='expanded'?'expanded':'rail');
  root.setAttribute('data-theme', t==='dark'?'dark':'light');
}catch(e){}})();
`.trim();
