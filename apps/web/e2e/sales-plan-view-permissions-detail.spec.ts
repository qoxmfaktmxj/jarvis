import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

test.describe("sales/plan-view-permissions/[id]/detail", () => {
  test.setTimeout(60_000);

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("redirects to list when plan not found", async ({ page }) => {
    await page.goto("/sales/plan-view-permissions/00000000-0000-0000-0000-000000000000/detail");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/sales\/plan-view-permissions(\?|$)/);
  });
});
