/**
 * e2e/admin-infra-licenses.spec.ts
 *
 * Phase-Sales P1.5 Task 5: admin/infra/licenses 라우트 smoke.
 *
 * 본격 CRUD 회귀는 Task 11에서 보강. 여기서는:
 *  - 페이지 로드 + 그리드 테이블 가시성
 *  - 22 모듈 boolean 그룹 헤더 4개 라벨이 보임
 *  - 입력 버튼 동작 (행 추가 → 저장 버튼 활성화)
 *  - 환경 필터 select가 보임
 */
import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

test.describe("admin/infra/licenses grid (smoke)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/infra/licenses");
    await page.waitForLoadState("networkidle");
  });

  test("page loads with grid table", async ({ page }) => {
    await expect(page.locator("table")).toBeVisible();
    await expect(page.getByText("인프라 라이선스")).toBeVisible();
  });

  test("module group headers render (사용자/관리, 급여/근태/복지, 포털/시스템, 협업/보안/IDP)", async ({
    page,
  }) => {
    await expect(page.getByText("사용자/관리").first()).toBeVisible();
    await expect(page.getByText("급여/근태/복지").first()).toBeVisible();
    await expect(page.getByText("포털/시스템").first()).toBeVisible();
    await expect(page.getByText("협업/보안/IDP").first()).toBeVisible();
  });

  test("filter q text input + 환경 select exist", async ({ page }) => {
    const qInput = page.locator('input[placeholder*="회사코드"]').first();
    await expect(qInput).toBeVisible();
    const devGbSelect = page.locator("select").filter({ hasText: /환경/ }).first();
    await expect(devGbSelect).toBeVisible();
  });

  test("insert row enables save button", async ({ page }) => {
    await page.locator("button", { hasText: "입력" }).first().click();
    const saveBtn = page.locator("button", { hasText: /저장/ }).first();
    await expect(saveBtn).toBeEnabled();
  });
});

test.describe("admin/infra/licenses — baseline assertions (Task 10)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/infra/licenses");
    await page.waitForLoadState("networkidle");
  });

  test("Excel download button is visible", async ({ page }) => {
    await expect(
      page.getByRole("button", { name: /엑셀 다운로드/i }),
    ).toBeVisible();
  });

  test("q search input value persists across reload via URL", async ({ page }) => {
    // q input is in DataGridToolbar children (placeholder = "검색어 입력" from ko.json Common.Search.placeholder)
    const input = page.locator('input[placeholder="검색어 입력"]').first();
    await expect(input).toBeVisible();
    await input.fill("ABC");
    // wait for 300ms debounce + URL update
    await page.waitForTimeout(500);
    // URL searchParam q should be set
    expect(page.url()).toContain("q=");
    // reload — SSR reads searchParams and passes as initialFilters
    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(input).toHaveValue("ABC");
  });
});
