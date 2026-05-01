/**
 * e2e/sales-activities.spec.ts
 *
 * sales/activities (TBIZ115) 그리드 smoke test (Phase 2 Task 6).
 * 10 visible columns: 활동명/영업기회/고객사/활동일/활동유형/
 * 접근경로/참석자/단계/제품군/등록일자.
 */
import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

test.describe("sales/activities grid", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/sales/activities");
    await page.waitForLoadState("networkidle");
  });

  test("activities grid loads", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /영업활동/ }).first()).toBeVisible();
  });

  test("10 visible columns rendered in header", async ({ page }) => {
    const header = page.locator("thead");
    await expect(header).toContainText("활동명");
    await expect(header).toContainText("영업기회");
    await expect(header).toContainText("고객사");
    await expect(header).toContainText("활동일");
    await expect(header).toContainText("활동유형");
    await expect(header).toContainText("접근경로");
    await expect(header).toContainText("참석자");
    await expect(header).toContainText("단계");
    await expect(header).toContainText("제품군");
    await expect(header).toContainText("등록일자");
  });

  test("Excel export button is visible", async ({ page }) => {
    const exportBtn = page.locator("button", { hasText: "엑셀 다운로드" });
    await expect(exportBtn).toBeVisible();
  });
});
