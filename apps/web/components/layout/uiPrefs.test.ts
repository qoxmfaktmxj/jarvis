import { beforeEach, describe, expect, it, vi } from "vitest";
import { setTheme, setThemeColor } from "./uiPrefs";

describe("uiPrefs", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.removeAttribute("data-theme-color");
  });

  it("stores and announces a theme mode change", () => {
    const listener = vi.fn();
    window.addEventListener("jv:theme-change", listener);

    setTheme("dark");

    expect(localStorage.getItem("jv.theme")).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(listener).toHaveBeenCalledOnce();
    expect((listener.mock.calls[0]?.[0] as CustomEvent).detail).toBe("dark");
    window.removeEventListener("jv:theme-change", listener);
  });

  it("stores and announces a brand color change", () => {
    const listener = vi.fn();
    window.addEventListener("jv:theme-color-change", listener);

    setThemeColor("red");

    expect(localStorage.getItem("jv.themeColor")).toBe("red");
    expect(document.documentElement.dataset.themeColor).toBe("red");
    expect(listener).toHaveBeenCalledOnce();
    expect((listener.mock.calls[0]?.[0] as CustomEvent).detail).toBe("red");
    window.removeEventListener("jv:theme-color-change", listener);
  });
});
