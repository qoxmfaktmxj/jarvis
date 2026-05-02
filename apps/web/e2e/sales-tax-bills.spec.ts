import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

test.describe("sales/tax-bills grid", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/sales/tax-bills");
    await page.waitForLoadState("networkidle");
  });

  test("renders grid and toolbar", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "세금계산서" })).toBeVisible();
    await expect(page.locator("table")).toBeVisible();
    await expect(page.locator("button", { hasText: "입력" }).first()).toBeVisible();
    await expect(page.locator("button", { hasText: "다운로드" })).toBeVisible();
  });

  test("supports q query param round-trip", async ({ page }) => {
    await page.goto("/sales/tax-bills?q=test");
    await page.waitForLoadState("networkidle");
    expect(page.url()).toContain("q=test");
    await expect(page.locator("table")).toBeVisible();
  });
});
