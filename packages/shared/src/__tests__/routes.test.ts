import { describe, expect, it } from "vitest";
import { isAllowedRoutePath, normalizeAllowedRoutePath, PUBLIC_ROUTE_ALLOWLIST, SYSTEM_MENUS } from "../constants/routes.js";

describe("routes constants", () => {
  it("allows only public same-origin routes", () => {
    const removedRoute = `/${["sa", "les"].join("")}/contracts`;
    expect(isAllowedRoutePath("/wiki/auto/concepts/average-wage")).toBe(true);
    expect(isAllowedRoutePath("https://example.invalid")).toBe(false);
    expect(isAllowedRoutePath(removedRoute)).toBe(false);
    expect(isAllowedRoutePath("/wiki%2Fauto%2Fconcepts%2Faverage-wage")).toBe(true);
    expect(isAllowedRoutePath("/wiki/../secret")).toBe(false);
  });

  it("normalizes only allowlisted route paths", () => {
    expect(normalizeAllowedRoutePath("/wiki%2Fmanual%2Fedit%2Fsample")).toBe("/wiki/manual/edit/sample");
    expect(() => normalizeAllowedRoutePath("//example.invalid")).toThrow(/allowlist/i);
  });

  it("contains every fixed menu route in the allowlist", () => {
    const menuRoutes = SYSTEM_MENUS.flatMap((menu) => (menu.routePath ? [menu.routePath] : []));
    expect(PUBLIC_ROUTE_ALLOWLIST).toEqual(expect.arrayContaining(menuRoutes));
  });
});
