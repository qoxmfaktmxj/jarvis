import { test, expect } from '@playwright/test';
import { loginAsTestUser } from './helpers/auth';

test.describe('Knowledge', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page);
  });

  test('/knowledge page loads', async ({ page }) => {
    await page.goto('/knowledge');
    await expect(page).toHaveURL(/\/knowledge/);
    await expect(page.locator('main')).toBeVisible();
  });

  test('/knowledge/new page renders', async ({ page }) => {
    await page.goto('/knowledge/new');
    await expect(page.locator('main')).toBeVisible();
  });
});
