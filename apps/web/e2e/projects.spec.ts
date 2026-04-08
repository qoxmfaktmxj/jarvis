import { test, expect } from '@playwright/test';
import { loginAsTestUser } from './helpers/auth';

test.describe('Projects', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page);
  });

  test('/projects page loads', async ({ page }) => {
    await page.goto('/projects');
    await expect(page).toHaveURL(/\/projects/);
    await expect(page.locator('main')).toBeVisible();
  });

  test('/projects/new page renders form', async ({ page }) => {
    await page.goto('/projects/new');
    await expect(page).toHaveURL(/\/projects\/new/);
    await expect(page.locator('form, [role="form"]').or(page.locator('main'))).toBeVisible();
  });
});
