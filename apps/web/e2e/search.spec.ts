// apps/web/e2e/search.spec.ts
import { test, expect } from '@playwright/test';

// Helper: log in before search tests
async function loginAsTestUser(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.getByLabel('이메일').fill('admin@jarvis.dev');
  await page.getByLabel('비밀번호').fill('password');
  await page.getByRole('button', { name: '로그인' }).click();
  await page.waitForURL('**/dashboard');
}

test.describe('Search', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page);
  });

  test('shows suggestions dropdown when typing in SearchBar', async ({ page }) => {
    await page.goto('/search');

    const searchInput = page.getByRole('searchbox', { name: '검색' });
    await searchInput.fill('프로젝');

    // Wait for debounce (300ms) and suggestion API call
    await page.waitForSelector('[id="search-suggestions"]', { timeout: 3000 });

    const suggestions = page.locator('[id="search-suggestions"] [role="option"]');
    await expect(suggestions.first()).toBeVisible();
  });

  test('navigates to search results on Enter', async ({ page }) => {
    await page.goto('/search');

    const searchInput = page.getByRole('searchbox', { name: '검색' });
    await searchInput.fill('Next.js');
    await searchInput.press('Enter');

    await page.waitForURL('**/search?q=**');
    await expect(page).toHaveURL(/\/search\?q=Next\.js/);

    // Should show result summary or empty state
    const hasSummary = await page
      .getByText(/검색 결과|결과 없음/)
      .isVisible()
      .catch(() => false);
    expect(hasSummary).toBe(true);
  });

  test('clicking a suggestion navigates to search results', async ({ page }) => {
    await page.goto('/search');

    const searchInput = page.getByRole('searchbox', { name: '검색' });
    await searchInput.fill('위키');

    // Wait for dropdown
    await page.waitForSelector('[id="search-suggestions"]', { timeout: 3000 });

    const firstSuggestion = page
      .locator('[id="search-suggestions"] [role="option"]')
      .first();
    const suggestionText = await firstSuggestion.textContent();
    await firstSuggestion.click();

    await page.waitForURL('**/search?q=**');
    expect(page.url()).toContain('/search?q=');
    // URL should contain the suggestion text (encoded)
    if (suggestionText) {
      expect(decodeURIComponent(page.url())).toContain(suggestionText.trim());
    }
  });

  test('applying page type filter updates URL params', async ({ page }) => {
    // Navigate directly to a search with results
    await page.goto('/search?q=문서');

    // Wait for results to load
    await page.waitForSelector('[data-testid="filter-panel"], aside', { timeout: 5000 });

    // Find a facet badge and click it
    const facetBadge = page.locator('aside button').first();
    const isVisible = await facetBadge.isVisible().catch(() => false);

    if (isVisible) {
      await facetBadge.click();
      await page.waitForURL('**/search?**pageType=**', { timeout: 3000 });
      expect(page.url()).toContain('pageType=');
    }
  });

  test('shows 결과 없음 message for non-existent search term', async ({ page }) => {
    const nonsenseTerm = 'xyzzy_no_results_12345_jarvis_test';
    await page.goto(`/search?q=${encodeURIComponent(nonsenseTerm)}`);

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Should show zero-results message
    await expect(page.getByText('결과 없음')).toBeVisible({ timeout: 5000 });
  });

  test('sort controls update URL on click', async ({ page }) => {
    await page.goto('/search?q=문서');

    // Wait for results
    await page.waitForLoadState('networkidle');

    const hasResults = await page
      .getByText(/검색 결과/)
      .isVisible()
      .catch(() => false);

    if (hasResults) {
      await page.getByText('최신순').click();
      await page.waitForURL('**/search?**sortBy=newest**', { timeout: 3000 });
      expect(page.url()).toContain('sortBy=newest');
    }
  });

  test('clear button in SearchBar clears the input', async ({ page }) => {
    await page.goto('/search');

    const searchInput = page.getByRole('searchbox', { name: '검색' });
    await searchInput.fill('테스트 검색어');

    // Wait for the X (clear) button to appear
    const clearButton = page.getByRole('button', { name: '검색어 지우기' });
    await expect(clearButton).toBeVisible();

    await clearButton.click();
    await expect(searchInput).toHaveValue('');
  });
});
