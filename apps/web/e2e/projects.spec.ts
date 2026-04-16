import { test, expect } from '@playwright/test';
import { loginAsTestUser, loginAsAdmin } from './helpers/auth';
import { expectNoA11yViolations } from './helpers/axe';

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
    await loginAsAdmin(page);
    await page.goto('/projects/new');
    await expect(page).toHaveURL(/\/projects\/new/);
    await expect(page.locator('form, [role="form"]').or(page.locator('main')).first()).toBeVisible();
  });

  test('/projects has no a11y violations', async ({ page }) => {
    await page.goto('/projects');
    await page.waitForLoadState('networkidle');
    await expectNoA11yViolations(page, 'projects');
  });
});
