/**
 * e2e/sales-product-cost-mapping.spec.ts
 *
 * Phase-Sales P1.5 Task 6: sales/product-cost-mapping 라우트 smoke.
 * Phase-Sales P2-A Task 7.8: Excel export + searchCostNm persistence +
 *   4-key composite duplicate block + pagination param.
 *
 * 4-key composite confirmed from legacy JSP line 76:
 *   dupChk(sheet1, "enterCd|productTypeCd|costCd|sdate")
 * In normalized schema: productTypeCd→productTypeId, costCd→costId, enterCd=workspaceId(implicit).
 * The duplicate check uses ["productTypeId", "costId", "sdate"].
 */
import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

test.describe("sales/product-cost-mapping grid (smoke)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/sales/product-cost-mapping");
    await page.waitForLoadState("networkidle");
  });

  test("page loads with grid table", async ({ page }) => {
    await expect(page.locator("table")).toBeVisible();
    await expect(page.getByText("제품-코스트 매핑")).toBeVisible();
  });

  test("core column headers render (제품군 / 코스트 / 시작일 / 종료일 / 사용중)", async ({
    page,
  }) => {
    await expect(page.getByRole("columnheader", { name: "제품군" }).first()).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "코스트" }).first()).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "시작일" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "종료일" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "사용중" })).toBeVisible();
  });

  test("filter q text input + 제품군/코스트 selects exist", async ({ page }) => {
    const qInput = page.locator('input[placeholder*="제품"]').first();
    await expect(qInput).toBeVisible();
    await expect(page.getByLabel("제품군 필터")).toBeVisible();
    await expect(page.getByLabel("코스트 필터")).toBeVisible();
  });

  test("insert row enables save button", async ({ page }) => {
    await page.locator("button", { hasText: "입력" }).first().click();
    const saveBtn = page.locator("button", { hasText: /저장/ }).first();
    await expect(saveBtn).toBeEnabled();
  });
});

// ---------------------------------------------------------------------------
// P2-A Task 7.8 — 4 scenarios
// ---------------------------------------------------------------------------
test.describe("sales/product-cost-mapping — P2-A baseline (Task 7.8)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/sales/product-cost-mapping");
    await page.waitForLoadState("networkidle");
  });

  // Scenario 1: Excel export button is visible and enabled
  test("Excel export button is visible", async ({ page }) => {
    const exportBtn = page.getByRole("button", { name: /엑셀 다운로드/i });
    await expect(exportBtn).toBeVisible({ timeout: 8000 });
    await expect(exportBtn).toBeEnabled();
  });

  // Scenario 2: searchCostNm filter persists in URL after Enter
  test("searchCostNm filter persists in URL after Enter", async ({ page }) => {
    const costNmInput = page.getByPlaceholder(/코스트명/i);
    await expect(costNmInput).toBeVisible();
    await costNmInput.fill("테스트코스트");
    await costNmInput.press("Enter");

    // URL should contain searchCostNm (URL-encoded Korean)
    await expect(page).toHaveURL(/searchCostNm=/, { timeout: 5000 });
  });

  // Scenario 3: 4-key composite duplicate blocked before save
  //
  // CRITICAL: both rows share ALL 4 composite fields:
  //   productTypeId = "" (blank), costId = "" (blank), sdate = today, workspaceId = implicit
  // Two blank new rows satisfy this condition immediately after insertion.
  test("4-key composite duplicate (productTypeId|costId|sdate) is blocked before save", async ({
    page,
  }) => {
    // Insert two new rows — both will have default blank productTypeId + costId + today sdate
    const insertBtn = page.getByRole("button", { name: /입력/i }).first();
    await insertBtn.click();
    await insertBtn.click();

    // Try to save — findDuplicateKeys should detect the collision
    const saveBtn = page.getByRole("button", { name: /저장/i }).first();
    await saveBtn.click();

    // Validation error should appear (does NOT proceed to server action)
    const errorMsg = page.getByText(/중복된 키/i);
    await expect(errorMsg).toBeVisible({ timeout: 5000 });
  });

  // Scenario 4: page param in URL
  test("page=1 searchParam is accepted without forbidden redirect", async ({ page }) => {
    await page.goto("/sales/product-cost-mapping?page=1");
    await page.waitForLoadState("networkidle");
    await expect(page).not.toHaveURL(/error=forbidden/);
    await expect(page.locator("table")).toBeVisible();
  });
});
