import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

test.describe("sales/opportunities/[id]/edit", () => {
  test.setTimeout(60_000);

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("redirects to list when opportunity not found", async ({ page }) => {
    await page.goto("/sales/opportunities/00000000-0000-0000-0000-000000000000/edit");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/sales\/opportunities(\?|$)/);
  });

  test("opportunities grid renders", async ({ page }) => {
    await page.goto("/sales/opportunities");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("table")).toBeVisible();
  });
});
