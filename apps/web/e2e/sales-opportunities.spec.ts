/**
 * e2e/sales-opportunities.spec.ts
 *
 * sales/opportunities (TBIZ110) 그리드 smoke test (Phase 2 Task 5).
 * 9 visible columns: 영업기회명/고객사명/제품군/영업기회단계/단계 변경일/
 * 담당부서/영업담당/영업기회출처/등록일자.
 */
import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

test.describe("sales/opportunities grid", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/sales/opportunities");
    await page.waitForLoadState("networkidle");
  });

  test("opportunities grid loads", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /영업기회/ }).first()).toBeVisible();
  });

  test("9 visible columns rendered in header", async ({ page }) => {
    const header = page.locator("thead");
    await expect(header).toContainText("영업기회명");
    await expect(header).toContainText("고객사명");
    await expect(header).toContainText("제품군");
    await expect(header).toContainText("영업기회단계");
    await expect(header).toContainText("단계 변경일");
    await expect(header).toContainText("담당부서");
    await expect(header).toContainText("영업담당");
    await expect(header).toContainText("영업기회출처");
    await expect(header).toContainText("등록일자");
  });

  test("Excel export button is visible", async ({ page }) => {
    const exportBtn = page.locator("button", { hasText: "엑셀 다운로드" });
    await expect(exportBtn).toBeVisible();
  });
});
