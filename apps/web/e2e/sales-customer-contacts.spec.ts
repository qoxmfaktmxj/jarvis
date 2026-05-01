/**
 * e2e/sales-customer-contacts.spec.ts
 *
 * sales/customer-contacts 그리드 smoke test (Task 9 / P1.5).
 * 레거시 ibSheet bizActCustomerMgr.jsp:207~220 Hidden:0 정책 검증:
 *  - custMcd(PK) / statusYn / sabun 컬럼은 보이지 않아야 함
 *  - 고객사명(JOIN) / 담당자명 / 직위 / 소속 / 전화 / 휴대폰 / 이메일 / 등록일자 보임
 */
import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

test.describe("sales/customer-contacts grid", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/sales/customer-contacts");
    await page.waitForLoadState("networkidle");
  });

  test("page loads with grid table", async ({ page }) => {
    await expect(page.locator("table")).toBeVisible();
  });

  test("toolbar has insert button (입력)", async ({ page }) => {
    const insertBtn = page.locator("button", { hasText: "입력" }).first();
    await expect(insertBtn).toBeVisible();
  });

  test("Hidden:0 columns visible (고객사명 / 담당자명 / 직위 / 소속 / 전화 / 휴대폰 / 이메일 / 등록일자)", async ({ page }) => {
    const header = page.locator("thead");
    await expect(header).toContainText("고객사명");
    await expect(header).toContainText("담당자명");
    await expect(header).toContainText("직위");
    await expect(header).toContainText("소속");
    await expect(header).toContainText("전화");
    await expect(header).toContainText("휴대폰");
    await expect(header).toContainText("이메일");
    await expect(header).toContainText("등록일자");
  });

  test("Hidden:1 columns not rendered (마스터코드 / 활성 / 담당사번)", async ({ page }) => {
    const header = page.locator("thead");
    await expect(header).not.toContainText("마스터코드");
    await expect(header).not.toContainText("활성");
    await expect(header).not.toContainText("담당사번");
  });

  test("inline create row + save button enabled", async ({ page }) => {
    await page.locator("button", { hasText: "입력" }).first().click();
    const saveBtn = page.locator("button", { hasText: /저장/ }).first();
    await expect(saveBtn).toBeEnabled();
  });
});

test.describe("sales/customer-contacts baseline assertions (P2-A)", () => {
  test("Excel 다운로드 button is visible", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/sales/customer-contacts");
    await page.waitForLoadState("networkidle");
    await expect(
      page.getByRole("button", { name: /엑셀 다운로드/i }),
    ).toBeVisible();
  });

  test("search filter persists across reload via URL (custName)", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/sales/customer-contacts");
    await page.waitForLoadState("networkidle");
    const input = page.locator('input[placeholder*="담당자명"]').first();
    await input.fill("test");
    await page.waitForTimeout(500); // 300ms debounce + buffer
    expect(page.url()).toContain("custName=test");
    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(input).toHaveValue("test");
  });
});
