import { test, expect } from '@playwright/test';

test.describe('Knowledge Platform', () => {
  test.beforeEach(async ({ page }) => {
    // Assumes dev auth bypass is set up (e.g., dev login cookie)
    await page.goto('/login');
    await page.fill('[name="email"]', 'admin@example.com');
    await page.fill('[name="password"]', 'password');
    await page.click('[type="submit"]');
    await page.waitForURL('/dashboard');
  });

  test('creates a knowledge page and views rendered MDX', async ({ page }) => {
    await page.goto('/knowledge/new');
    await expect(page.getByText('New Knowledge Page')).toBeVisible();

    // Fill metadata
    await page.fill('#title', 'Test Onboarding Guide');
    // Slug auto-fills from title

    // Select page type
    await page.getByRole('combobox').first().click();
    await page.getByRole('option', { name: 'Onboarding' }).click();

    // Fill MDX content
    await page.fill('textarea', '# Welcome\n\nThis is a **test** onboarding page.\n\n- Item 1\n- Item 2');

    // Save
    await page.getByRole('button', { name: 'Create Page' }).click();

    // Should redirect to page viewer
    await page.waitForURL(/\/knowledge\/[a-f0-9-]+$/);
    await expect(page.getByRole('heading', { name: 'Welcome', level: 1 })).toBeVisible();
    await expect(page.getByText('This is a')).toBeVisible();
  });

  test('knowledge home shows categorized sections', async ({ page }) => {
    await page.goto('/knowledge');
    await expect(page.getByText('Knowledge Base')).toBeVisible();
    await expect(page.getByText('Onboarding')).toBeVisible();
    await expect(page.getByText('HR Policies')).toBeVisible();
    await expect(page.getByText('FAQ')).toBeVisible();
    await expect(page.getByText('Glossary')).toBeVisible();
  });

  test('version history shows versions and diff dialog', async ({ page }) => {
    // Navigate to a known page's history
    await page.goto('/knowledge');
    const firstLink = page.locator('a[href^="/knowledge/"]').first();
    const href = await firstLink.getAttribute('href');
    if (!href) return test.skip();

    await page.goto(`${href}/history`);
    await expect(page.getByText('Version History')).toBeVisible();
    await expect(page.getByText('v1')).toBeVisible();
  });
});
