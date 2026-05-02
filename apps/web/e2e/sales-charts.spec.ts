/**
 * e2e/sales-charts.spec.ts
 *
 * Playwright smoke spec for 5 chart routes (Task 17).
 *
 * Routes under test:
 *   /sales/charts/marketing   → Sales.Charts.Marketing.title  "마케팅 차트"
 *   /sales/charts/admin       → Sales.Charts.Admin.title      "전체실적 (관리자)"
 *   /sales/charts/sales       → Sales.Charts.Sales.title      "매출/이익 트렌드"
 *   /sales/charts/upload      → Sales.Charts.Upload.placeholderTitle "계획/실적 업로드"
 *   /sales/charts/dashboard   → Sales.Charts.Dashboard.title  "영업 대시보드"
 *
 * Auth: loginAsAdmin from helpers/auth (session injection, no UI login).
 * Chart presence: .recharts-surface OR empty-state text "표시할 데이터가 없습니다."
 *
 * Note: waitUntil "domcontentloaded" is used instead of "load" because
 * Next.js RSC streaming pages may keep the connection open (long RSC flush),
 * which prevents the browser "load" event from firing within the test timeout.
 */
import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

test.describe("sales/charts — route smoke tests", () => {
  // RSC pages may stream for several seconds; use a generous per-test timeout.
  test.setTimeout(90_000);

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("marketing chart route renders heading", async ({ page }) => {
    await page.goto("/sales/charts/marketing", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await expect(
      page.getByRole("heading", { name: "마케팅 차트" }),
    ).toBeVisible({ timeout: 30_000 });
  });

  test("admin chart route renders heading", async ({ page }) => {
    await page.goto("/sales/charts/admin", { waitUntil: "domcontentloaded", timeout: 60_000 });
    // Both the page h1 and the ChartCard h3 use this title — target the h1.
    await expect(
      page.locator("h1", { hasText: "전체실적 (관리자)" }),
    ).toBeVisible({ timeout: 30_000 });
  });

  test("sales chart route renders heading", async ({ page }) => {
    await page.goto("/sales/charts/sales", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await expect(
      page.getByRole("heading", { name: "매출/이익 트렌드" }),
    ).toBeVisible({ timeout: 30_000 });
  });

  test("upload route renders placeholder heading", async ({ page }) => {
    await page.goto("/sales/charts/upload", { waitUntil: "domcontentloaded", timeout: 60_000 });
    // Both the page h1 and UploadPlaceholderCard h2 use this text — target the h1.
    await expect(
      page.locator("h1", { hasText: "계획/실적 업로드" }),
    ).toBeVisible({ timeout: 30_000 });
  });

  test("dashboard chart route renders heading", async ({ page }) => {
    await page.goto("/sales/charts/dashboard", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await expect(
      page.getByRole("heading", { name: "영업 대시보드" }),
    ).toBeVisible({ timeout: 30_000 });
  });

  test("admin chart route renders chart or empty state", async ({ page }) => {
    await page.goto("/sales/charts/admin", { waitUntil: "domcontentloaded", timeout: 60_000 });
    // Wait for either the recharts SVG or the empty-state text to appear.
    await page.waitForFunction(
      () =>
        document.querySelectorAll(".recharts-surface").length > 0 ||
        document.body.innerText.includes("표시할 데이터가 없습니다."),
      { timeout: 30_000 },
    );

    const hasChart = await page.locator(".recharts-surface").count();
    const hasEmpty = await page.getByText("표시할 데이터가 없습니다.").count();
    expect(hasChart + hasEmpty).toBeGreaterThan(0);
  });
});
