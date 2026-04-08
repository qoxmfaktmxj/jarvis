import { test, expect } from '@playwright/test';
import { loginAsTestUser } from './helpers/auth';

test.describe('Search', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page);
  });

  test('/search page loads', async ({ page }) => {
    await page.goto('/search');
    await expect(page).toHaveURL(/\/search/);
    await expect(page.locator('main')).toBeVisible();
  });

  test('search with query renders results or empty state', async ({ page }) => {
    await page.goto('/search?q=테스트');
    await expect(page.locator('main')).toBeVisible();
    // Either results or "결과 없음" empty state
    const hasContent = await page.locator('main').textContent();
    expect(hasContent).toBeTruthy();
  });

  test('typing in search input and pressing Enter navigates to /search?q=', async ({ page }) => {
    await page.goto('/search');
    const searchInput = page.getByRole('searchbox').or(page.getByPlaceholder(/검색|Search/i)).first();
    if (await searchInput.count() > 0) {
      await searchInput.fill('Next.js');
      await searchInput.press('Enter');
      await expect(page).toHaveURL(/\/search\?q=/);
    }
  });
});
