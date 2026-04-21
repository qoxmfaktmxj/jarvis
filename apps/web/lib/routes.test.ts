import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { NAV_ITEMS, ACTION_ITEMS, ROUTE_LABELS, LEGACY_REDIRECTS } from "./routes";

describe("routes registry", () => {
  it("has unique nav hrefs", () => {
    const hrefs = NAV_ITEMS.map((i) => i.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("has unique action ids", () => {
    const ids = ACTION_ITEMS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("does not contain legacy /systems in NAV_ITEMS or ACTION_ITEMS", () => {
    for (const item of [...NAV_ITEMS, ...ACTION_ITEMS]) {
      expect(item.href.startsWith("/systems")).toBe(false);
    }
  });

  it("ROUTE_LABELS covers every top-level nav href", () => {
    for (const nav of NAV_ITEMS) {
      const label = ROUTE_LABELS.find(([prefix]) => nav.href === prefix || nav.href.startsWith(prefix + "/"));
      expect(label, `missing label for ${nav.href}`).toBeDefined();
    }
  });

  it("LEGACY_REDIRECTS maps retired paths to current ones", () => {
    expect(LEGACY_REDIRECTS["/systems"]).toBe("/projects");
    expect(LEGACY_REDIRECTS["/attendance"]).toBe("/contractors");
  });

  // Middleware cannot import routes.ts (lucide-react drags into the edge
  // bundle), so it keeps the redirect logic inline. This test reads the
  // middleware source and asserts each LEGACY_REDIRECTS entry shows up
  // there, so the two drift together.
  it("middleware.ts references every LEGACY_REDIRECTS target", () => {
    const middlewarePath = resolve(__dirname, "..", "middleware.ts");
    const source = readFileSync(middlewarePath, "utf8");
    for (const [from, to] of Object.entries(LEGACY_REDIRECTS)) {
      expect(source, `middleware.ts missing redirect source ${from}`).toContain(from);
      expect(source, `middleware.ts missing redirect target ${to}`).toContain(to);
    }
  });
});
