/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  setThemeColor,
  useThemeColor,
  DEFAULT_THEME_COLOR,
  THEME_COLOR_IDS,
  type ThemeColorId,
} from "./uiPrefs";

describe("uiPrefs.themeColor", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme-color");
  });

  it("DEFAULT_THEME_COLOR가 'blue'", () => {
    expect(DEFAULT_THEME_COLOR).toBe("blue");
  });

  it("THEME_COLOR_IDS가 5종", () => {
    expect(THEME_COLOR_IDS).toEqual(["blue", "indigo", "teal", "forest", "graphite"]);
  });

  it("setThemeColor가 localStorage + data-theme-color attribute + event 발행", () => {
    const listener = vi.fn();
    window.addEventListener("jv:theme-color-change", listener);

    setThemeColor("indigo");

    expect(window.localStorage.getItem("jv.themeColor")).toBe("indigo");
    expect(document.documentElement.getAttribute("data-theme-color")).toBe("indigo");
    expect(listener).toHaveBeenCalledTimes(1);
    const detail = (listener.mock.calls[0]![0] as CustomEvent<ThemeColorId>).detail;
    expect(detail).toBe("indigo");

    window.removeEventListener("jv:theme-color-change", listener);
  });

  it("useThemeColor가 localStorage에서 초기값 읽음", () => {
    window.localStorage.setItem("jv.themeColor", "forest");
    const { result } = renderHook(() => useThemeColor());
    expect(result.current).toBe("forest");
  });

  it("useThemeColor가 invalid 값을 'blue'로 fallback", () => {
    window.localStorage.setItem("jv.themeColor", "invalid-color");
    const { result } = renderHook(() => useThemeColor());
    expect(result.current).toBe("blue");
  });

  it("useThemeColor가 setThemeColor 호출에 반응", () => {
    const { result } = renderHook(() => useThemeColor());
    expect(result.current).toBe("blue");
    act(() => setThemeColor("teal"));
    expect(result.current).toBe("teal");
  });
});
