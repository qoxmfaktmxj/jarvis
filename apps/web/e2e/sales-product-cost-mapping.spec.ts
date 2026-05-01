/**
 * e2e/sales-product-cost-mapping.spec.ts
 *
 * Phase-Sales P1.5 Task 6: sales/product-cost-mapping 라우트 smoke.
 *
 * 본격 CRUD 회귀는 Task 11에서 보강. 여기서는:
 *  - 페이지 로드 + 그리드 테이블 가시성
 *  - 핵심 컬럼 헤더 (제품군 / 코스트 / 시작일 / 종료일 / 사용중)
 *  - 입력 버튼 동작 (행 추가 → 저장 버튼 활성화)
 *  - 제품군/코스트 필터 select가 보임
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
