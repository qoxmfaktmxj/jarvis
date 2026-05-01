/**
 * e2e/admin-codes.spec.ts
 *
 * 공통코드관리(/admin/codes) smoke.
 *
 * 본격 CRUD 회귀(생성→저장→재로딩 / 삭제→복원)는 follow-up. 여기서는:
 *  - 페이지 로드 + 두 그리드 섹션 헤더 가시성
 *  - 마스터 필터 4개 input + 마스터 toolbar 4개 버튼 가시성
 *  - 디테일 그리드는 마스터 행 선택 전까지 빈 안내 표시 + 입력 disabled
 *  - 마스터 입력 버튼 클릭 → 새 행 추가 / 저장 버튼 활성화
 */
import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

test.describe("admin/codes grid (smoke)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/codes");
    await page.waitForLoadState("networkidle");
  });

  test("page loads with master + detail sections", async ({ page }) => {
    // PageHeader title
    await expect(page.getByRole("heading", { name: "공통코드관리" })).toBeVisible();
    // Master section title
    await expect(page.getByText("그룹코드 관리").first()).toBeVisible();
    // Detail section title
    await expect(page.getByText("세부코드 관리").first()).toBeVisible();
  });

  test("master filter row exposes 4 inputs", async ({ page }) => {
    await expect(
      page.locator('input[placeholder="그룹코드"]').first(),
    ).toBeVisible();
    await expect(
      page.locator('input[placeholder="그룹코드명"]').first(),
    ).toBeVisible();
    await expect(
      page.locator('input[placeholder="포함 세부 코드명 입력"]').first(),
    ).toBeVisible();
    // kind select (구분 (전체))
    const kindSelect = page.locator("select").filter({ hasText: /구분/ }).first();
    await expect(kindSelect).toBeVisible();
  });

  test("master toolbar shows insert/copy/save/export", async ({ page }) => {
    await expect(page.locator("button", { hasText: "입력" }).first()).toBeVisible();
    await expect(page.locator("button", { hasText: "복사" }).first()).toBeVisible();
    await expect(page.locator("button", { hasText: /저장/ }).first()).toBeVisible();
    await expect(page.locator("button", { hasText: "다운로드" }).first()).toBeVisible();
  });

  test("detail section is empty until a master row is selected", async ({ page }) => {
    // The empty cell text uses Admin.Codes.itemSection.emptyMaster which is
    // shown both as the placeholder note and in the table body when no row is selected.
    await expect(
      page.getByText("그룹코드를 먼저 선택하세요.").first(),
    ).toBeVisible();
  });

  test("master insert adds a new row + enables save button", async ({ page }) => {
    // Click the master toolbar 입력 (first 입력 on the page is master).
    await page.locator("button", { hasText: "입력" }).first().click();
    // A row with state "new" should exist (DOM data-row-status attribute).
    await expect(page.locator('tr[data-row-status="new"]').first()).toBeVisible();
    // Save button should be enabled (dirtyCount > 0).
    const saveBtn = page.locator("button", { hasText: /저장/ }).first();
    await expect(saveBtn).toBeEnabled();
  });
});
