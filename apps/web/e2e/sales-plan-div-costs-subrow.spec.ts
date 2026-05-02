import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

test.describe("sales/plan-div-costs sub-row modal", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/sales/plan-div-costs");
    await page.waitForLoadState("networkidle");
  });

  test("renders 관리 button column on parent grid", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "계획배부비" })).toBeVisible();
    await expect(page.locator("th", { hasText: "관리" }).first()).toBeVisible();
  });

  test("clicking 관리 opens the sub-row modal and 닫기 closes it", async ({ page }) => {
    const manageBtn = page.locator('[data-testid="plan-div-cost-manage-btn"]').first();
    const count = await manageBtn.count();
    test.skip(count === 0, "no seeded plan_div_cost rows in this workspace");

    await manageBtn.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByText("배부 상세율")).toBeVisible();
    await expect(page.locator('button', { hasText: "입력" })).toBeVisible();
    await expect(page.locator('button', { hasText: "닫기" })).toBeVisible();

    await page.locator('button', { hasText: "닫기" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
  });
});
