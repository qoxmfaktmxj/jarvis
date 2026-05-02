import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

test.describe("sales/charts/trend", () => {
  test.setTimeout(60_000);

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/sales/charts/trend");
    await page.waitForLoadState("networkidle");
  });

  test("page loads with heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "매출/이익 추이 차트" })).toBeVisible();
  });

  test("renders trend chart and tabs", async ({ page }) => {
    await expect(page.getByTestId("trend-chart")).toBeVisible();
    await expect(page.getByTestId("trend-tab-SALES")).toBeVisible();
    await expect(page.getByTestId("trend-tab-OP_INCOME")).toBeVisible();
  });

  test("metric tab click switches URL", async ({ page }) => {
    await page.getByTestId("trend-tab-OP_INCOME").click();
    await page.waitForLoadState("networkidle");
    expect(page.url()).toContain("metric=OP_INCOME");
  });
});
