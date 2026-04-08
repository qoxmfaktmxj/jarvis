import { test, expect } from '@playwright/test';
import { loginAsTestUser } from './helpers/auth';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page);
    await page.goto('/dashboard');
  });

  test('dashboard page loads', async ({ page }) => {
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.locator('main')).toBeVisible();
  });

  test('page title contains 대시보드 or Dashboard', async ({ page }) => {
    const title = await page.title();
    expect(title.toLowerCase()).toMatch(/대시보드|dashboard|jarvis/i);
  });
});
