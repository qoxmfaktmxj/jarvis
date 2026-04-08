import { test, expect } from '@playwright/test';
import { loginAsTestUser } from './helpers/auth';

test.describe('Systems', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page);
  });

  test('/systems page loads', async ({ page }) => {
    await page.goto('/systems');
    await expect(page).toHaveURL(/\/systems/);
    await expect(page.locator('main')).toBeVisible();
  });
});
