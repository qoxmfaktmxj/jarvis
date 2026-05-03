/**
 * e2e/maintenance-stats.spec.ts
 *
 * Maintenance Stats page e2e tests.
 *
 * Task: Test tab navigation, category filter, and search button state.
 * Prerequisite: Uses helpers/auth.ts loginAsAdmin for session injection.
 */
import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

test.describe("Maintenance Stats", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/maintenance/stats");
    await page.waitForLoadState("networkidle");
  });

  test("page loads with title and tabs", async ({ page }) => {
    // Page heading
    await expect(page.getByRole("heading", { name: /운영현황|Maintenance/ })).toBeVisible();

    // Tabs visible (company / manager / combined)
    const tablist = page.locator('[role="tablist"]');
    await expect(tablist).toBeVisible();
  });

  test("tab navigation — company → manager → combined", async ({ page }) => {
    // Company tab should be selected by default
    const companyTab = page.locator('[role="tab"]').first();
    await expect(companyTab).toHaveAttribute("aria-selected", "true");

    // Click manager tab
    const managerTab = page.locator('[role="tab"]').nth(1);
    await managerTab.click();
    await expect(managerTab).toHaveAttribute("aria-selected", "true");
    await expect(companyTab).toHaveAttribute("aria-selected", "false");

    // Click combined tab
    const combinedTab = page.locator('[role="tab"]').nth(2);
    await combinedTab.click();
    await expect(combinedTab).toHaveAttribute("aria-selected", "true");
    await expect(managerTab).toHaveAttribute("aria-selected", "false");
  });

  test("category checkboxes — uncheck all disables search button", async ({ page }) => {
    // By default, all 6 categories are checked → search button enabled
    const searchBtn = page.locator("button").filter({ hasText: /조회|Search/ }).first();
    await expect(searchBtn).toBeEnabled();

    // Find all category checkboxes (in the toolbar fieldset)
    const checkboxes = page.locator('input[type="checkbox"]');
    const count = await checkboxes.count();

    // Uncheck all categories
    for (let i = 0; i < count; i++) {
      const checkbox = checkboxes.nth(i);
      if (await checkbox.isChecked()) {
        await checkbox.click();
      }
    }

    // Search button should be disabled now
    await expect(searchBtn).toBeDisabled();

    // Check at least one category
    if (count > 0) {
      await checkboxes.first().click();
      await expect(searchBtn).toBeEnabled();
    }
  });
});
