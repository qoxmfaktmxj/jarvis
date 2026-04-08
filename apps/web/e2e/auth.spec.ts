import { test, expect } from '@playwright/test';
import { loginAsTestUser } from './helpers/auth';

test.describe('Authentication', () => {
  test('unauthenticated / redirects to /login', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
  });

  test('/login page renders', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveURL(/\/login/);
    // Page should have some visible content
    await expect(page.locator('body')).toBeVisible();
  });

  test('authenticated user can reach /dashboard', async ({ page }) => {
    await loginAsTestUser(page);
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/dashboard/);
  });
});
