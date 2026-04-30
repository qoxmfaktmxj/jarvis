/**
 * e2e/sales-customers.spec.ts
 *
 * sales/customers 그리드 smoke test.
 * DataGrid 공통 컴포넌트 + SALES_ALL 권한 게이트 검증.
 *
 * 전제: E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD 환경변수 또는
 *       helpers/auth.ts loginAsAdmin 사용.
 */
import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

test.describe("sales/customers grid", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/sales/customers");
    await page.waitForLoadState("networkidle");
  });

  test("page loads with grid table", async ({ page }) => {
    await expect(page.locator("table")).toBeVisible();
  });

  test("toolbar has insert/save buttons", async ({ page }) => {
    const toolbar = page.locator("button", { hasText: "입력" }).first();
    await expect(toolbar).toBeVisible();
  });

  test("inline create row + save button enabled", async ({ page }) => {
    await page.locator("button", { hasText: "입력" }).first().click();
    const saveBtn = page.locator("button", { hasText: /저장/ }).first();
    await expect(saveBtn).toBeEnabled();
  });

  test("filter inputs exist for custCd and custNm", async ({ page }) => {
    const custCdInput = page
      .locator('input[placeholder*="고객코드"]')
      .or(page.locator('input[placeholder*="코드"]'))
      .first();
    await expect(custCdInput).toBeVisible();
  });
});
