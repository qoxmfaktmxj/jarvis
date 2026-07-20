import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { PUBLIC_ROUTE_ALLOWLIST, SYSTEM_MENUS } from "@jarvis/shared/constants/routes";

export const APPROVED_PAGE_ROUTES = [
  "/",
  "/forbidden",
  "/login",
  "/dashboard",
  "/ask",
  "/ask/[conversationId]",
  "/wiki",
  "/wiki/[...path]",
  "/wiki/manual/edit/[...path]",
  "/search",
  "/profile",
] as const;

export const APPROVED_ADMIN_ROUTES = [
  "/admin/sources",
  "/admin/wiki-reviews",
  "/admin/users",
  "/admin/menus",
  "/admin/codes",
  "/admin/llm-usage",
  "/admin/audit",
] as const;

export const APPROVED_API_ROUTES = [
  "/api/auth/login",
  "/api/auth/demo",
  "/api/auth/logout",
  "/api/ask",
  "/api/wiki/search",
  "/api/wiki/page",
  "/api/search",
] as const;

export const MENU_ROUTE_ALLOWLIST = PUBLIC_ROUTE_ALLOWLIST;

export type RouteReport = { violations: string[] };

function toRoutePath(appRoot: string, file: string) {
  const segments = relative(appRoot, file).replaceAll("\\", "/").split("/");
  segments.pop();
  return `/${segments.filter((segment) => !/^\(.+\)$/.test(segment)).join("/")}`.replace(/\/$/, "") || "/";
}

function isApprovedUiRoute(route: string) {
  return route.startsWith("/admin/")
    ? APPROVED_ADMIN_ROUTES.some((approved) => approved === route)
    : APPROVED_PAGE_ROUTES.some((approved) => approved === route);
}

function isApprovedApiRoute(route: string) {
  return APPROVED_API_ROUTES.some((approved) => approved === route);
}

export function isMenuRouteAllowed(route: string): boolean {
  return MENU_ROUTE_ALLOWLIST.some((approved) => approved === route);
}

export function verifyApprovedRoutesAgainstSharedConstants(): RouteReport {
  const violations: string[] = [];
  const menuRoutes = SYSTEM_MENUS.flatMap((menu) => (menu.routePath ? [menu.routePath] : [])) as string[];
  const allowlistedRoutes = [...PUBLIC_ROUTE_ALLOWLIST] as string[];
  const expectedSeededRoutes: string[] = [
    "/dashboard",
    "/ask",
    "/wiki",
    "/search",
    ...APPROVED_ADMIN_ROUTES,
  ];

  for (const route of menuRoutes) {
    if (!allowlistedRoutes.includes(route)) {
      violations.push(`Seeded menu route is not allowlisted: ${route}`);
    }
  }
  for (const route of expectedSeededRoutes) {
    if (!menuRoutes.includes(route)) {
      violations.push(`Approved menu route is not seeded: ${route}`);
    }
  }
  if (menuRoutes.includes("/profile")) {
    violations.push("Profile must remain a fixed shell link, not a managed menu");
  }
  if (new Set(menuRoutes).size !== menuRoutes.length) {
    violations.push("Seeded menu routes must be unique");
  }
  return { violations: violations.sort((left, right) => left.localeCompare(right)) };
}

async function collectRouteFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  async function walk(current: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile() && (entry.name === "page.tsx" || entry.name === "route.ts")) files.push(path);
    }
  }
  await walk(directory);
  return files;
}

export async function verifyRoutes(root: string, strict = false): Promise<RouteReport> {
  if (!strict) return { violations: [] };

  const appRoot = join(root, "apps", "web", "app");
  const files = await collectRouteFiles(appRoot);
  const routeViolations = files.flatMap((file) => {
    const route = toRoutePath(appRoot, file);
    if (file.replaceAll("\\", "/").endsWith("/route.ts")) {
      return isApprovedApiRoute(route) ? [] : [`Unapproved route: ${route}`];
    }
    return isApprovedUiRoute(route) ? [] : [`Unapproved route: ${route}`];
  });
  const contract = verifyApprovedRoutesAgainstSharedConstants();
  return {
    violations: [...routeViolations, ...contract.violations].sort((left, right) => left.localeCompare(right)),
  };
}

export async function main(): Promise<void> {
  const report = await verifyRoutes(process.cwd(), true);
  if (report.violations.length === 0) return;
  console.error(report.violations.join("\n"));
  process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
