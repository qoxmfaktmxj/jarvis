import { describe, expect, it } from "vitest";
import {
  DEFAULT_THEME,
  DEFAULT_THEME_COLOR,
  THEME_COLORS,
  resolveTheme,
  resolveThemeColor,
} from "./theme-config";

describe("theme config", () => {
  it("uses light blue as the default theme", () => {
    expect(DEFAULT_THEME).toBe("light");
    expect(DEFAULT_THEME_COLOR).toBe("blue");
  });

  it("allows only blue, forest, and red brand colors", () => {
    expect(THEME_COLORS).toEqual([
      { id: "blue", hex: "#2D8CDB" },
      { id: "forest", hex: "#176B4D" },
      { id: "red", hex: "#A33A3A" },
    ]);
  });

  it("falls back when persisted values are invalid", () => {
    expect(resolveTheme("dark")).toBe("dark");
    expect(resolveTheme("invalid")).toBe("light");
    expect(resolveThemeColor("forest")).toBe("forest");
    expect(resolveThemeColor("invalid")).toBe("blue");
  });
});
