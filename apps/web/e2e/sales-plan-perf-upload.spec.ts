import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

test.describe("sales/charts/plan-perf-upload", () => {
  test.setTimeout(60_000);

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/sales/charts/plan-perf-upload");
    await page.waitForLoadState("networkidle");
  });

  test("page loads with heading + grid", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "계획/실적전망 업로드" })).toBeVisible();
    await expect(page.locator("table")).toBeVisible();
  });

  test("template + upload buttons visible", async ({ page }) => {
    await expect(page.getByRole("button", { name: "템플릿 다운로드" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Excel 업로드|업로드 중/ })).toBeVisible();
  });

  test("filter round-trips through URL", async ({ page }) => {
    await page.goto("/sales/charts/plan-perf-upload?ym=202604&gubunCd=PLAN");
    await page.waitForLoadState("networkidle");
    expect(page.url()).toContain("ym=202604");
    expect(page.url()).toContain("gubunCd=PLAN");
    await expect(page.locator("table")).toBeVisible();
  });
});
