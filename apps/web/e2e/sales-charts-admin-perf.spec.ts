import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

test.describe("sales/charts/admin-perf", () => {
  test.setTimeout(60_000);

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/sales/charts/admin-perf");
    await page.waitForLoadState("networkidle");
  });

  test("page loads with heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "관리자 실적 차트" })).toBeVisible();
  });

  test("renders chart container", async ({ page }) => {
    await expect(page.getByTestId("admin-perf-chart")).toBeVisible();
  });

  test("year + view + metric query params round-trip", async ({ page }) => {
    await page.goto("/sales/charts/admin-perf?year=2025&view=quarter&metric=GROSS_PROFIT");
    await page.waitForLoadState("networkidle");
    expect(page.url()).toContain("year=2025");
    expect(page.url()).toContain("view=quarter");
    expect(page.url()).toContain("metric=GROSS_PROFIT");
  });
});
