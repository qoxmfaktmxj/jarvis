import { expect, test, type Page } from "@playwright/test";
import { loginAsAdmin, loginAsEditor, loginAsReader } from "./helpers/auth";

const ALL_ADMIN_ROUTES = [
  "/admin/sources",
  "/admin/wiki-reviews",
  "/admin/users",
  "/admin/menus",
  "/admin/codes",
  "/admin/llm-usage",
  "/admin/audit",
] as const;

const ALLOWED_BY_ROLE = {
  ADMIN: [...ALL_ADMIN_ROUTES],
  EDITOR: ["/admin/sources", "/admin/wiki-reviews"],
  READER: [],
} as const;

const LOGIN_BY_ROLE: Record<keyof typeof ALLOWED_BY_ROLE, (page: Page) => Promise<void>> = {
  ADMIN: loginAsAdmin,
  EDITOR: loginAsEditor,
  READER: loginAsReader,
};

for (const role of ["READER", "EDITOR", "ADMIN"] as const) {
  for (const route of ALL_ADMIN_ROUTES) {
    test(`${role} ${route}`, async ({ page }) => {
      await LOGIN_BY_ROLE[role](page);
      await page.goto(route);
      const allowed = ALLOWED_BY_ROLE[role].includes(route);
      if (allowed) {
        await expect(page.getByRole("heading")).toBeVisible();
        await expect(page).toHaveURL(new RegExp(`${route.replace("/", "\\/")}$`));
      } else {
        await expect(page).toHaveURL(/\/forbidden$/);
        await expect(page.getByRole("heading", { name: "접근 권한이 없습니다." })).toBeVisible();
      }
    });
  }
}
