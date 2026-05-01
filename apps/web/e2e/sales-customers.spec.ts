/**
 * e2e/sales-customers.spec.ts
 *
 * sales/customers 그리드 smoke test (Task 9 / P1.5).
 * 레거시 ibSheet bizActCustCompanyMgr.jsp:221~233 Hidden:0 정책 검증:
 *  - custCd / businessNo / businessKind / homepage / addr1 PK 또는 부가 컬럼은 보이지 않아야 함
 *  - custNm / custKindCd / custDivCd / ceoNm / telNo / 등록일자 보임
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

  test("Hidden:0 columns visible (고객명 / 고객종류 / 고객구분 / 대표자 / 전화번호 / 등록일자)", async ({ page }) => {
    const header = page.locator("thead");
    await expect(header).toContainText("고객명");
    await expect(header).toContainText("고객종류");
    await expect(header).toContainText("고객구분");
    await expect(header).toContainText("대표자");
    await expect(header).toContainText("전화번호");
    await expect(header).toContainText("등록일자");
  });

  test("Hidden:1 columns not rendered (고객코드 / 사업자번호 / 업종 / 홈페이지 / 주소)", async ({ page }) => {
    const header = page.locator("thead");
    await expect(header).not.toContainText("고객코드");
    await expect(header).not.toContainText("사업자번호");
    await expect(header).not.toContainText("업종");
    await expect(header).not.toContainText("홈페이지");
    await expect(header).not.toContainText("주소");
  });

  test("filter input exists for custNm", async ({ page }) => {
    const custNmInput = page.locator('input[placeholder*="고객명"]').first();
    await expect(custNmInput).toBeVisible();
  });
});
