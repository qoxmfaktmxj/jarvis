// apps/web/e2e/ask-scoped.spec.ts
// Tests the /ask page when launched with a ?snapshot= query param
// (graph-scoped ask flow introduced in feat/graphify-trust-and-scope).

import { expect, test } from '@playwright/test';
import { loginAsDeveloper } from './helpers/auth';
import {
  createTestSnapshot,
  deleteTestSnapshot,
  type FixtureSnapshot,
} from './helpers/graph-fixtures';

let snapshot: FixtureSnapshot;

test.beforeAll(async () => {
  snapshot = await createTestSnapshot({
    title: 'E2E Auth Service Graph',
    buildStatus: 'done',
  });
});

test.afterAll(async () => {
  await deleteTestSnapshot(snapshot.id);
});

test.describe('Ask page — graph-scoped mode', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDeveloper(page);
  });

  test('shows scope badge when ?snapshot= is set', async ({ page }) => {
    await page.goto(`/ask?snapshot=${snapshot.id}`);

    // The dismissable scope badge should appear above the composer
    await expect(
      page.getByText('그래프 범위: E2E Auth Service Graph'),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('pre-fills question when both ?q= and ?snapshot= are set', async ({ page }) => {
    const q = 'auth 서비스는 어떻게 연결되어 있나요?';
    await page.goto(
      `/ask?q=${encodeURIComponent(q)}&snapshot=${snapshot.id}`,
    );

    const input = page.getByPlaceholder(/질문을 입력하세요/);
    await expect(input).toHaveValue(q, { timeout: 10_000 });
    await expect(
      page.getByText('그래프 범위: E2E Auth Service Graph'),
    ).toBeVisible();
  });

  test('dismissing the scope badge clears the scope', async ({ page }) => {
    await page.goto(`/ask?snapshot=${snapshot.id}`);

    await expect(
      page.getByText('그래프 범위: E2E Auth Service Graph'),
    ).toBeVisible({ timeout: 10_000 });

    // The ✕ button inside the badge
    await page.locator('button', { hasText: '✕' }).click();

    await expect(
      page.getByText('그래프 범위: E2E Auth Service Graph'),
    ).not.toBeVisible();
  });

  test('sends snapshotId to /api/ask when scope is active', async ({ page }) => {
    let capturedBody: Record<string, unknown> | null = null;

    await page.route('/api/ask', async (route) => {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      capturedBody = body;
      // Return a minimal SSE response so the UI doesn't hang
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: [
          'data: {"type":"text","content":"테스트 응답입니다."}\n\n',
          'data: {"type":"sources","sources":[]}\n\n',
          'data: {"type":"done","totalTokens":5}\n\n',
        ].join(''),
      });
    });

    await page.goto(`/ask?snapshot=${snapshot.id}`);
    const input = page.getByPlaceholder(/질문을 입력하세요/);
    await input.fill('auth 서비스 구조?');
    await page.locator('button[title="전송 (Ctrl+Enter)"]').click();

    await expect(page.locator('.prose')).toBeVisible({ timeout: 10_000 });

    expect(capturedBody).not.toBeNull();
    expect(capturedBody!['snapshotId']).toBe(snapshot.id);
  });
});
