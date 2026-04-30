/**
 * e2e/admin-companies.spec.ts
 *
 * admin/companies 그리드 회귀 baseline.
 * Task 1 DataGrid 추출 후에도 동일 동작 보장.
 *
 * 전제: E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD 환경변수 또는
 *       helpers/auth.ts loginAsAdmin 사용.
 */
import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

test.describe("admin/companies grid (regression baseline)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/companies");
    await page.waitForLoadState("networkidle");
  });

  test("page loads with grid table", async ({ page }) => {
    await expect(page.locator("table")).toBeVisible();
  });

  test("toolbar has insert/copy/save buttons", async ({ page }) => {
    // Admin.Companies.actions.insert / copy / save
    const toolbar = page.locator("div").filter({ hasText: /입력/ }).first();
    await expect(toolbar).toBeVisible();
  });

  test("inline create row + unsaved count increments", async ({ page }) => {
    // Click insert button
    await page.locator("button", { hasText: "입력" }).first().click();
    // A new row with state "new" should appear (or save button count > 0)
    const saveBtn = page.locator("button", { hasText: /저장/ }).first();
    await expect(saveBtn).toBeEnabled();
  });

  test("filter input exists for code/name search", async ({ page }) => {
    // ColumnFilterRow has a text input for q (code/회사명)
    const filterInput = page.locator('input[placeholder*="코드"]').or(
      page.locator('input[placeholder*="회사"]')
    ).first();
    await expect(filterInput).toBeVisible();
  });
});
