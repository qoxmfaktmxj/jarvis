/**
 * e2e/sales-product-types.spec.ts
 *
 * sales/product-types 그리드 smoke test + P2-A baseline assertions.
 * 컬럼: 제품코드(productCd) / 제품명(productNm) / 등록일자.
 * syncWithUrl=true (DataGrid) + DataGridToolbar export("엑셀 다운로드").
 */
import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

test.describe("sales/product-types grid", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/sales/product-types");
    await page.waitForLoadState("networkidle");
  });

  test("page loads with grid table", async ({ page }) => {
    await expect(page.locator("table")).toBeVisible();
  });

  test("toolbar has insert button (입력)", async ({ page }) => {
    const insertBtn = page.locator("button", { hasText: "입력" }).first();
    await expect(insertBtn).toBeVisible();
  });

  test("core column headers visible (제품코드 / 제품명 / 등록일자)", async ({ page }) => {
    const header = page.locator("thead");
    await expect(header).toContainText("제품코드");
    await expect(header).toContainText("제품명");
    await expect(header).toContainText("등록일자");
  });

  test("inline create row + save button enabled", async ({ page }) => {
    await page.locator("button", { hasText: "입력" }).first().click();
    const saveBtn = page.locator("button", { hasText: /저장/ }).first();
    await expect(saveBtn).toBeEnabled();
  });
});

test.describe("sales/product-types baseline assertions (P2-A)", () => {
  test("Excel 다운로드 button is visible", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/sales/product-types");
    await page.waitForLoadState("networkidle");
    await expect(
      page.getByRole("button", { name: /엑셀 다운로드/i }),
    ).toBeVisible();
  });

  test("search filter persists across reload via URL (productNm)", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/sales/product-types");
    await page.waitForLoadState("networkidle");
    const input = page.locator('input[placeholder*="제품명"]').first();
    await input.fill("test");
    await page.waitForTimeout(500); // 300ms debounce + buffer
    expect(page.url()).toContain("productNm=test");
    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(input).toHaveValue("test");
  });
});
