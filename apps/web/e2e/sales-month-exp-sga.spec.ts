import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

test.describe("sales/month-exp-sga grid", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/sales/month-exp-sga");
    await page.waitForLoadState("networkidle");
  });

  test("renders grid and toolbar", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "월별 경비/판관비" })).toBeVisible();
    await expect(page.locator("table")).toBeVisible();
    await expect(page.locator("button", { hasText: "입력" }).first()).toBeVisible();
    await expect(page.locator("button", { hasText: "다운로드" })).toBeVisible();
  });

  test("supports ym query param round-trip", async ({ page }) => {
    await page.goto("/sales/month-exp-sga?ym=202605");
    await page.waitForLoadState("networkidle");
    expect(page.url()).toContain("ym=202605");
    await expect(page.locator("table")).toBeVisible();
  });
});
