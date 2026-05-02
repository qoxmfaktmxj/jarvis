import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@jarvis/db/client";
import { user as userSchema } from "@jarvis/db/schema/user";
import { userSession } from "@jarvis/db/schema/user-session";
import { ROLE_PERMISSIONS } from "@jarvis/shared/constants/permissions";

const SESSION_COOKIE = "sessionId";
const SESSION_TTL_MS = 60 * 60 * 8 * 1000;

const MENU_ROUTES = [
  "/notices",
  "/ask",
  "/search",
  "/wiki",
  "/wiki/graph",
  "/knowledge",
] as const;

async function loginAsSeededAdmin(page: Page): Promise<void> {
  const [u] = await db
    .select({
      id: userSchema.id,
      workspaceId: userSchema.workspaceId,
      employeeId: userSchema.employeeId,
      name: userSchema.name,
      email: userSchema.email,
    })
    .from(userSchema)
    .where(eq(userSchema.email, "admin@jarvis.dev"))
    .limit(1);

  if (!u) {
    throw new Error(
      "Seeded user not found: admin@jarvis.dev. Run pnpm db:seed against the e2e DB.",
    );
  }

  const sessionId = randomUUID();
  const now = Date.now();

  await db.insert(userSession).values({
    id: sessionId,
    data: {
      id: sessionId,
      userId: u.id,
      workspaceId: u.workspaceId,
      employeeId: u.employeeId,
      name: u.name,
      email: u.email ?? "admin@jarvis.dev",
      roles: ["ADMIN"],
      permissions: [...(ROLE_PERMISSIONS.ADMIN ?? [])],
      createdAt: now,
      expiresAt: now + SESSION_TTL_MS,
    } as unknown as Record<string, unknown>,
    expiresAt: new Date(now + SESSION_TTL_MS),
  });

  await page.context().addCookies([
    {
      name: SESSION_COOKIE,
      value: sessionId,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

function tab(page: Page, route: string) {
  return page.getByTestId(`tab-${route}`);
}

function globalTabs(page: Page) {
  return page.getByTestId("tabbar-scroll").getByRole("tab");
}

async function openSidebarTab(page: Page, route: string): Promise<void> {
  const link = page.locator(`aside a[href="${route}"]`).first();
  await expect(link).toBeVisible();
  await link.click();
  await expect(tab(page, route)).toBeVisible();
}

async function pinTab(page: Page, route: string): Promise<void> {
  await tab(page, route).click({ button: "right" });
  await expect(page.getByTestId("tab-context-menu")).toBeVisible();
  await page.getByTestId("ctx-pin").click();
  await expect(tab(page, route).getByLabel("고정됨")).toBeVisible();
}

async function expectSelected(page: Page, route: string): Promise<void> {
  await expect(tab(page, route)).toHaveAttribute("aria-selected", "true");
}

test.describe("global tabs", () => {
  test.describe.configure({ timeout: 60_000 });

  test.beforeEach(async ({ page }) => {
    await loginAsSeededAdmin(page);
    await page.goto("/dashboard", { waitUntil: "domcontentloaded", timeout: 45_000 });
    await expect(page.locator("aside")).toBeVisible({ timeout: 15_000 });
    await page
      .getByTestId("tab-runtime-ready")
      .waitFor({ state: "attached", timeout: 15_000 });
  });

  test("sidebar click creates a tab", async ({ page }) => {
    await openSidebarTab(page, "/wiki");
    await expect(globalTabs(page)).toHaveCount(1);
  });

  test("opening a sixth tab evicts the least recently used unpinned tab", async ({ page }) => {
    for (const route of MENU_ROUTES.slice(0, 5)) {
      await openSidebarTab(page, route);
    }

    await openSidebarTab(page, MENU_ROUTES[5]);

    await expect(tab(page, MENU_ROUTES[0])).toHaveCount(0);
    for (const route of MENU_ROUTES.slice(1, 6)) {
      await expect(tab(page, route)).toBeVisible();
    }
    await expect(globalTabs(page)).toHaveCount(5);
  });

  test("all five pinned tabs block a sixth tab", async ({ page }) => {
    for (const route of MENU_ROUTES.slice(0, 5)) {
      await openSidebarTab(page, route);
    }
    for (const route of MENU_ROUTES.slice(0, 5)) {
      await pinTab(page, route);
    }

    await page.locator(`aside a[href="${MENU_ROUTES[5]}"]`).first().click();

    await expect(tab(page, MENU_ROUTES[5])).toHaveCount(0);
    await expect(globalTabs(page)).toHaveCount(5);
  });

  test("closing a dirty tab shows the unsaved changes dialog", async ({ page }) => {
    await openSidebarTab(page, "/admin/companies");
    await page.goto("/admin/companies", { waitUntil: "domcontentloaded", timeout: 45_000 });
    await expect(tab(page, "/admin/companies")).toBeVisible();
    await page.getByRole("button", { name: "입력" }).first().click();

    await expect(tab(page, "/admin/companies").locator("[data-dirty]")).toBeVisible();
    await page.getByTestId("close-/admin/companies").click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/저장 안 된 변경/)).toBeVisible();
  });

  test("Ctrl+W, Ctrl+Tab, and Ctrl+1 through Ctrl+5 shortcuts work", async ({ page }) => {
    const routes = MENU_ROUTES.slice(0, 5);
    for (const route of routes) {
      await openSidebarTab(page, route);
    }

    for (let i = 1; i <= routes.length; i++) {
      await page.keyboard.press(`Control+${i}`);
      await expectSelected(page, routes[i - 1]);
    }

    await page.keyboard.press("Control+Tab");
    await expectSelected(page, routes[0]);

    await page.keyboard.press("Control+Shift+Tab");
    await expectSelected(page, routes[4]);

    await page.keyboard.press("Control+W");
    await expect(tab(page, routes[4])).toHaveCount(0);
    await expect(globalTabs(page)).toHaveCount(4);
  });

  test("F5 restores tabs and pinned state", async ({ page }) => {
    for (const route of MENU_ROUTES.slice(0, 3)) {
      await openSidebarTab(page, route);
    }
    await pinTab(page, MENU_ROUTES[1]);

    await page.waitForTimeout(700);
    await page.reload();

    for (const route of MENU_ROUTES.slice(0, 3)) {
      await expect(tab(page, route)).toBeVisible();
    }
    await expect(tab(page, MENU_ROUTES[1]).getByLabel("고정됨")).toBeVisible();
  });
});
