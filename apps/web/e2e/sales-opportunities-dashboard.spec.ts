/**
 * e2e/sales-opportunities-dashboard.spec.ts
 *
 * sales/opportunities/dashboard smoke (Phase 2 Task 8).
 * KPI 4 + Recharts BarChart + LineChart.
 *
 * NOTE: HQ dashboard (`/sales/dashboard`) is covered separately by
 * `sales-hq-dashboard.spec.ts`.
 */
import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

test.describe("sales/opportunities/dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/sales/opportunities/dashboard");
    await page.waitForLoadState("networkidle");
  });

  test("opportunities dashboard renders KPI + 2 charts", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /영업기회현황/i })).toBeVisible();
    await expect(page.getByText(/전체 영업기회/i)).toBeVisible();
    await expect(page.getByText(/단계별 영업기회 분포/i)).toBeVisible();
    await expect(page.getByText(/월별 신규 영업기회/i)).toBeVisible();
  });
});
