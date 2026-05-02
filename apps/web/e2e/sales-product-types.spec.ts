/**
 * e2e/sales-product-types.spec.ts
 *
 * sales/product-types 그리드 smoke — P1-8 baseline.
 *
 * Page: apps/web/app/(app)/sales/product-types/page.tsx
 * Heading: "제품군관리"
 * Columns: productCd (제품코드) / productNm (제품명) / createdAt (등록일자)
 * Filters: 제품코드 / 제품명
 *
 * Mirrors the conventions used by sales-mail-persons.spec.ts and
 * sales-product-cost-mapping.spec.ts (loginAsAdmin → goto → networkidle →
 * locator-based assertions).
 */
import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

test.describe("sales/product-types grid (smoke)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/sales/product-types");
    await page.waitForLoadState("networkidle");
  });

  test("page loads with 제품군관리 heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "제품군관리" })).toBeVisible();
  });

  test("grid renders required column headers (제품코드 / 제품명 / 등록일자)", async ({ page }) => {
    const header = page.locator("thead");
    await expect(header).toContainText("제품코드");
    await expect(header).toContainText("제품명");
    await expect(header).toContainText("등록일자");
  });

  test("insert button creates a new blank row + enables save", async ({ page }) => {
    await page.locator("button", { hasText: "입력" }).first().click();
    const saveBtn = page.locator("button", { hasText: /저장/ }).first();
    await expect(saveBtn).toBeEnabled();
  });

  test("filter inputs (제품코드 / 제품명) + 검색 button are visible", async ({ page }) => {
    const codeInput = page.getByPlaceholder("제품코드").first();
    const nameInput = page.getByPlaceholder("제품명").first();
    await expect(codeInput).toBeVisible();
    await expect(nameInput).toBeVisible();

    const searchBtn = page.locator("button", { hasText: /검색/ }).first();
    await expect(searchBtn).toBeVisible();
    await expect(searchBtn).toBeEnabled();
  });
});
