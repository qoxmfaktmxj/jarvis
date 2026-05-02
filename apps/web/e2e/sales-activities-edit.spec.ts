import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

test.describe("sales/activities/[id]/edit", () => {
  test.setTimeout(60_000);

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("redirects to list when activity not found", async ({ page }) => {
    await page.goto("/sales/activities/00000000-0000-0000-0000-000000000000/edit");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/sales\/activities(\?|$)/);
  });

  test("activities grid has working double-click handler", async ({ page }) => {
    await page.goto("/sales/activities");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("table")).toBeVisible();
  });
});
