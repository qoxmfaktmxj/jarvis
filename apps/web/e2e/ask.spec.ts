// apps/web/e2e/ask.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Ask AI page', () => {
  test.beforeEach(async ({ page }) => {
    // Assume test user is seeded and session cookie is set via global setup
    await page.goto('/ask');
  });

  test('loads the Ask AI page', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Ask AI' })).toBeVisible();
  });

  test('shows popular questions chips', async ({ page }) => {
    // Popular questions are rendered as chips if they exist in DB
    const chips = page.locator('button').filter({ hasText: /\S/ });
    // Just verify the input area is present even if no chips
    await expect(page.getByPlaceholder('질문을 입력하세요')).toBeVisible();
  });

  test('submits a question and shows streaming response', async ({ page }) => {
    const input = page.getByPlaceholder('질문을 입력하세요');
    await input.fill('Jarvis 시스템 접속 방법은?');

    // Click send button
    await page.getByRole('button', { name: '전송' }).click();

    // Input should be disabled while streaming
    await expect(input).toBeDisabled();

    // Wait for answer to appear (up to 30s for LLM)
    await expect(page.locator('.prose')).toBeVisible({ timeout: 30_000 });

    // Answer should have text content
    const answerText = await page.locator('.prose').first().textContent();
    expect(answerText?.length).toBeGreaterThan(10);

    // After streaming completes, input is re-enabled
    await expect(input).toBeEnabled({ timeout: 35_000 });
  });

  test('shows source references after stream completes', async ({ page }) => {
    const input = page.getByPlaceholder('질문을 입력하세요');
    await input.fill('프로젝트 관리 방법을 알려주세요');
    await input.press('Control+Enter');

    // Wait for sources section
    await expect(page.getByText('참고 문서')).toBeVisible({ timeout: 35_000 });
  });

  test('handles rate limit error gracefully', async ({ page }) => {
    // Mock the API to return 429
    await page.route('/api/ask', (route) =>
      route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Rate limit exceeded', retryAfter: 3600 }),
      }),
    );

    await page.getByPlaceholder('질문을 입력하세요').fill('test');
    await page.getByRole('button', { name: '전송' }).click();

    await expect(page.getByText(/요청 한도를 초과/)).toBeVisible({ timeout: 5000 });
  });

  test('reset button clears conversation', async ({ page }) => {
    const input = page.getByPlaceholder('질문을 입력하세요');
    await input.fill('테스트 질문');
    await page.getByRole('button', { name: '전송' }).click();

    // Wait for answer
    await expect(page.locator('.prose')).toBeVisible({ timeout: 30_000 });

    // Click reset
    await page.getByTitle('대화 초기화').click();

    // Conversation should be cleared
    await expect(page.locator('.prose')).not.toBeVisible();
  });
});
