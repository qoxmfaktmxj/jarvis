import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

test.describe("sales/charts/marketing", () => {
  test.setTimeout(60_000);

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/sales/charts/marketing");
    await page.waitForLoadState("networkidle");
  });

  test("page loads with heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "영업 마케팅 차트" })).toBeVisible();
  });

  test("renders activity + product chart containers", async ({ page }) => {
    await expect(page.getByTestId("marketing-activity-chart")).toBeVisible();
    await expect(page.getByTestId("marketing-product-chart")).toBeVisible();
  });

  test("ym query param round-trips", async ({ page }) => {
    await page.goto("/sales/charts/marketing?ym=202604");
    await page.waitForLoadState("networkidle");
    expect(page.url()).toContain("ym=202604");
    await expect(page.getByTestId("marketing-activity-chart")).toBeVisible();
  });
});
