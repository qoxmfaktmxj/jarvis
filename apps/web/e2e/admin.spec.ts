import { test, expect } from '@playwright/test';

// Assumes a seeded ADMIN user with credentials admin@jarvis.local / password
const ADMIN_EMAIL    = process.env.E2E_ADMIN_EMAIL    ?? 'admin@jarvis.local';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'password';

test.describe('Admin Panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(ADMIN_EMAIL);
    await page.getByLabel('Password').fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL('/dashboard');
  });

  test('renders admin sub-navigation', async ({ page }) => {
    await page.goto('/admin/users');
    await expect(page.getByRole('link', { name: 'Users' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Organizations' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Audit Log' })).toBeVisible();
  });

  test('UserTable renders with table headers', async ({ page }) => {
    await page.goto('/admin/users');
    await expect(page.getByRole('columnheader', { name: 'Employee ID' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Name' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Roles' })).toBeVisible();
  });

  test('non-admin is redirected from admin panel', async ({ page, context }) => {
    // Clear session to simulate non-admin
    await context.clearCookies();
    await page.goto('/admin/users');
    await expect(page).toHaveURL(/\/dashboard\?error=forbidden/);
  });

  test('search analytics page renders stat cards', async ({ page }) => {
    await page.goto('/admin/search-analytics');
    await expect(page.getByText('Searches Today')).toBeVisible();
    await expect(page.getByText('Zero-Result Rate')).toBeVisible();
    await expect(page.getByText('Avg Response')).toBeVisible();
  });

  test('audit log page renders table', async ({ page }) => {
    await page.goto('/admin/audit');
    await expect(page.getByRole('columnheader', { name: 'Action' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Resource' })).toBeVisible();
  });
});
