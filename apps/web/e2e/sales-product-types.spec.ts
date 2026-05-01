/**
 * e2e/sales-product-types.spec.ts
 *
 * sales/product-types 그리드 smoke test + baseline assertions (Task 10 / P2-A).
 * 레거시 ibSheet 제품군 마스터 정책 검증:
 *  - 제품코드 / 제품명 / 등록일자 컬럼이 보임
 *  - 입력 버튼 → 저장 버튼 활성화
 *
 * baseline assertions (Task 10):
 *  - Excel 다운로드 버튼 가시성
 *  - productNm 검색 input → URL searchParam 갱신 → reload → value 유지
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

  test("Hidden:0 columns visible (제품코드 / 제품명 / 등록일자)", async ({ page }) => {
    const header = page.locator("thead");
    await expect(header).toContainText("제품코드");
    await expect(header).toContainText("제품명");
    await expect(header).toContainText("등록일자");
  });

  test("filter inputs exist for productCd and productNm", async ({ page }) => {
    await expect(page.locator('input[placeholder*="제품코드"]').first()).toBeVisible();
    await expect(page.locator('input[placeholder*="제품명"]').first()).toBeVisible();
  });

  test("inline create row + save button enabled", async ({ page }) => {
    await page.locator("button", { hasText: "입력" }).first().click();
    const saveBtn = page.locator("button", { hasText: /저장/ }).first();
    await expect(saveBtn).toBeEnabled();
  });
});

test.describe("sales/product-types — baseline assertions (Task 10)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/sales/product-types");
    await page.waitForLoadState("networkidle");
  });

  test("Excel download button is visible", async ({ page }) => {
    await expect(
      page.getByRole("button", { name: /엑셀 다운로드/i }),
    ).toBeVisible();
  });

  test("productNm search input value persists across reload via URL", async ({ page }) => {
    // productNm filter is in DataGrid's ColumnFilterRow (placeholder = "제품명" from FILTERS const)
    const input = page.locator('input[placeholder="제품명"]').first();
    await expect(input).toBeVisible();
    await input.fill("테스트제품");
    // wait for DataGrid onFilterChange to fire + useUrlFilters URL update
    await page.waitForTimeout(500);
    // URL searchParam productNm should be set
    expect(page.url()).toContain("productNm=");
    // reload — SSR reads searchParams and passes as initialFilters
    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(input).toHaveValue("테스트제품");
  });
});
