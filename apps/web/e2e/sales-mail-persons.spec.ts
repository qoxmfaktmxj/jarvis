/**
 * e2e/sales-mail-persons.spec.ts
 *
 * sales/mail-persons 그리드 smoke test (Task 8 / P1.5).
 * 레거시 ibSheet bizMailPersonMgr.jsp:26~35 Hidden:0 정책 검증:
 *  - sabun(PK) 컬럼은 보이지 않아야 함
 *  - name / mailId / salesYn / insaYn / memo / 등록일자 보임
 */
import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

test.describe("sales/mail-persons grid", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/sales/mail-persons");
    await page.waitForLoadState("networkidle");
  });

  test("page loads with grid table", async ({ page }) => {
    await expect(page.locator("table")).toBeVisible();
  });

  test("toolbar has insert button (입력)", async ({ page }) => {
    const insertBtn = page.locator("button", { hasText: "입력" }).first();
    await expect(insertBtn).toBeVisible();
  });

  test("Hidden:0 columns visible (이름 / 메일 ID / 영업 / 인사 / 메모 / 등록일자)", async ({ page }) => {
    const header = page.locator("thead");
    await expect(header).toContainText("이름");
    await expect(header).toContainText("메일 ID");
    await expect(header).toContainText("영업");
    await expect(header).toContainText("인사");
    await expect(header).toContainText("메모");
    await expect(header).toContainText("등록일자");
  });

  test("sabun column is Hidden (PK) — not rendered as a header", async ({ page }) => {
    const header = page.locator("thead");
    await expect(header).not.toContainText("사번");
  });

  test("inline create row + save button enabled", async ({ page }) => {
    await page.locator("button", { hasText: "입력" }).first().click();
    const saveBtn = page.locator("button", { hasText: /저장/ }).first();
    await expect(saveBtn).toBeEnabled();
  });
});
