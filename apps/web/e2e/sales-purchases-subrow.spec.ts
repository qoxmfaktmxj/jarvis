import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

test.describe("sales/purchases sub-row modal", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/sales/purchases");
    await page.waitForLoadState("networkidle");
  });

  test("renders 관리 button column on parent grid", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "매입관리" })).toBeVisible();
    // The header label "관리" should appear (last interactive col).
    await expect(page.locator("th", { hasText: "관리" }).first()).toBeVisible();
  });

  test("clicking 관리 opens the sub-row modal and 닫기 closes it", async ({ page }) => {
    const manageBtn = page.locator('[data-testid="purchase-manage-btn"]').first();
    // If the seed has any purchase rows, the button will exist. Otherwise skip.
    const count = await manageBtn.count();
    test.skip(count === 0, "no seeded purchase rows in this workspace");

    await manageBtn.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByText("구매 프로젝트")).toBeVisible();
    await expect(page.locator('button', { hasText: "입력" })).toBeVisible();
    await expect(page.locator('button', { hasText: "닫기" })).toBeVisible();

    await page.locator('button', { hasText: "닫기" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
  });
});
