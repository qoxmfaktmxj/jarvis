import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

test.describe("sales/charts/plan-perf", () => {
  test.setTimeout(60_000);

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/sales/charts/plan-perf");
    await page.waitForLoadState("networkidle");
  });

  test("page loads with heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "계획대비 실적 차트" })).toBeVisible();
  });

  test("renders chart container", async ({ page }) => {
    await expect(page.getByTestId("plan-perf-chart")).toBeVisible();
  });

  test("year + metric query params round-trip", async ({ page }) => {
    await page.goto("/sales/charts/plan-perf?year=2025&metric=OP_INCOME");
    await page.waitForLoadState("networkidle");
    expect(page.url()).toContain("year=2025");
    expect(page.url()).toContain("metric=OP_INCOME");
  });
});
