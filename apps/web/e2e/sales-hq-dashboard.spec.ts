import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

test.describe("sales/dashboard (HQ board)", () => {
  test.setTimeout(60_000);

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/sales/dashboard");
    await page.waitForLoadState("networkidle");
  });

  test("page loads with heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "영업본부 대시보드" })).toBeVisible();
  });

  test("renders 4 sub-charts", async ({ page }) => {
    await expect(page.getByTestId("dash-sales-trend")).toBeVisible();
    await expect(page.getByTestId("dash-suc-prob")).toBeVisible();
    await expect(page.getByTestId("dash-op-income")).toBeVisible();
    await expect(page.getByTestId("dash-ba")).toBeVisible();
  });
});
