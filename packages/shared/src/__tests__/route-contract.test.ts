import { describe, expect, it } from "vitest";
import { PUBLIC_ROUTE_ALLOWLIST, SYSTEM_MENUS } from "../constants/routes.js";

describe("route contract", () => {
  it("keeps static routes and fixed menu routes in one source of truth", () => {
    const menuRoutes = SYSTEM_MENUS.flatMap((menu) => (menu.routePath ? [menu.routePath] : []));
    expect(new Set(PUBLIC_ROUTE_ALLOWLIST).size).toBe(PUBLIC_ROUTE_ALLOWLIST.length);
    expect(PUBLIC_ROUTE_ALLOWLIST).toEqual(expect.arrayContaining(menuRoutes));
  });
});
