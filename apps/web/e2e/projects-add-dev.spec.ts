import { test, expect } from "@playwright/test";
import { loginAsTestUser } from "./helpers/auth";

test.describe("Projects ↔ Add-Dev integration", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page);
  });

  test("project detail shows related add-dev list", async ({ page }) => {
    await page.goto("/projects");
    const firstRowLink = page.locator("table tbody tr").first().locator("a").first();
    await firstRowLink.click();
    await page.getByRole("link", { name: /추가개발/ }).click();
    await expect(page).toHaveURL(/\/projects\/[^/]+\/add-dev$/);
    await expect(page.getByRole("heading", { level: 2 })).toContainText("추가개발");
  });

  test("new add-dev from project detail preselects project", async ({ page }) => {
    await page.goto("/projects");
    await page.locator("table tbody tr").first().locator("a").first().click();
    await page.getByRole("link", { name: /추가개발/ }).click();
    await page.getByRole("link", { name: /새 추가개발/ }).click();
    await expect(page).toHaveURL(/\/add-dev\/new\?projectId=[0-9a-f-]+/);
  });
});
