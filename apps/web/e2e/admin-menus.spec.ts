/**
 * e2e/admin-menus.spec.ts
 *
 * 메뉴 관리(/admin/menus) smoke.
 *
 * 본격 CRUD 회귀(생성→저장→재로딩 / 권한 토글)는 follow-up. 여기서는:
 *  - 페이지 로드 + master + detail 섹션 헤더 가시성
 *  - master 필터 4개 input + master toolbar 4개 버튼 가시성
 *  - detail 그리드는 master 행 선택 전까지 빈 안내 표시
 *  - master 입력 버튼 클릭 → 새 행 추가 / 저장 버튼 활성화
 */
import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

test.describe("admin/menus grid (smoke)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/menus");
    await page.waitForLoadState("networkidle");
  });

  test("page loads with master + detail sections", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "메뉴 설정" })).toBeVisible();
    await expect(page.getByText("메뉴 목록").first()).toBeVisible();
    await expect(page.getByText("메뉴 권한").first()).toBeVisible();
  });

  test("master filter row exposes inputs + selects", async ({ page }) => {
    await expect(page.locator('input[placeholder="코드"]').first()).toBeVisible();
    await expect(page.locator('input[placeholder="라벨"]').first()).toBeVisible();
    // kind select (종류 (전체))
    const kindSelect = page.locator("select").filter({ hasText: /종류/ }).first();
    await expect(kindSelect).toBeVisible();
    // parent select (부모 (전체))
    const parentSelect = page.locator("select").filter({ hasText: /부모/ }).first();
    await expect(parentSelect).toBeVisible();
  });

  test("master toolbar shows insert/copy/save/export", async ({ page }) => {
    await expect(page.locator("button", { hasText: "입력" }).first()).toBeVisible();
    await expect(page.locator("button", { hasText: "복사" }).first()).toBeVisible();
    await expect(page.locator("button", { hasText: /저장/ }).first()).toBeVisible();
    await expect(page.locator("button", { hasText: "다운로드" }).first()).toBeVisible();
  });

  test("detail section is empty until a master row is selected", async ({ page }) => {
    await expect(page.getByText("메뉴를 선택하세요.").first()).toBeVisible();
  });

  test("master insert adds a new row + enables save button", async ({ page }) => {
    await page.locator("button", { hasText: "입력" }).first().click();
    await expect(page.locator('tr[data-row-status="new"]').first()).toBeVisible();
    const saveBtn = page.locator("button", { hasText: /저장/ }).first();
    await expect(saveBtn).toBeEnabled();
  });
});
