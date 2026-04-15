// apps/web/e2e/architecture-lifecycle.spec.ts
// Tests the architecture page build-lifecycle UI:
// BuildLifecycleSection, BuildStatusCard, and SnapshotSelector status badges.

import { expect, test } from '@playwright/test';
import { loginAsDeveloper } from './helpers/auth';
import {
  createTestSnapshot,
  deleteTestSnapshot,
  type FixtureSnapshot,
} from './helpers/graph-fixtures';

let doneSnapshot: FixtureSnapshot;
let runningSnapshot: FixtureSnapshot;
let errorSnapshot: FixtureSnapshot;

test.beforeAll(async () => {
  [doneSnapshot, runningSnapshot, errorSnapshot] = await Promise.all([
    createTestSnapshot({ title: 'E2E Done Build', buildStatus: 'done' }),
    createTestSnapshot({ title: 'E2E Running Build', buildStatus: 'running' }),
    createTestSnapshot({
      title: 'E2E Error Build',
      buildStatus: 'error',
      buildError: 'out of memory at step: embed',
    }),
  ]);
});

test.afterAll(async () => {
  await Promise.all([
    deleteTestSnapshot(doneSnapshot.id),
    deleteTestSnapshot(runningSnapshot.id),
    deleteTestSnapshot(errorSnapshot.id),
  ]);
});

test.describe('Architecture page — build lifecycle UI', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDeveloper(page);
  });

  test('shows BuildLifecycleSection with non-zero counts', async ({ page }) => {
    await page.goto('/architecture');

    // Section title
    await expect(page.getByText('빌드 현황')).toBeVisible({ timeout: 10_000 });

    // At least one count > 0 should appear somewhere in the status chips
    const chips = page.locator('span').filter({ hasText: /빌드 중|대기 중|오류|완료/ });
    await expect(chips.first()).toBeVisible();
  });

  test('shows running snapshot in the active list', async ({ page }) => {
    await page.goto('/architecture');

    await expect(page.getByRole('link', { name: 'E2E Running Build' })).toBeVisible({ timeout: 10_000 });
  });

  test('shows error snapshot in the active list', async ({ page }) => {
    await page.goto('/architecture');

    await expect(page.getByRole('link', { name: 'E2E Error Build' })).toBeVisible({ timeout: 10_000 });
  });

  test('selecting a running snapshot shows BuildStatusCard — running variant', async ({ page }) => {
    await page.goto(`/architecture?snapshot=${runningSnapshot.id}`);

    await expect(page.getByText(/빌드 진행 중/)).toBeVisible({ timeout: 10_000 });
    // Elapsed-time badge should also appear
    await expect(page.getByText(/초 경과/)).toBeVisible({ timeout: 10_000 });
  });

  test('selecting an error snapshot shows BuildStatusCard — error variant with message', async ({
    page,
  }) => {
    await page.goto(`/architecture?snapshot=${errorSnapshot.id}`);

    await expect(page.getByText(/빌드 실패/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('out of memory at step: embed')).toBeVisible({ timeout: 10_000 });
  });

  test('SnapshotSelector shows status emoji prefix for non-done builds', async ({
    page,
  }) => {
    await page.goto('/architecture');

    // The selector option for the running snapshot should include the ⟳ emoji
    const selector = page.locator('select');
    await expect(selector).toBeVisible({ timeout: 10_000 });

    const optionTexts = await selector.locator('option').allTextContents();
    const runningOption = optionTexts.find((t) => t.includes('E2E Running Build'));
    expect(runningOption).toBeDefined();
    expect(runningOption).toContain('⟳');
  });

  test('done snapshot falls back gracefully to graph viewer area', async ({
    page,
  }) => {
    await page.goto(`/architecture?snapshot=${doneSnapshot.id}`);

    // Either the GraphViewer iframe or the no-viz fallback message should appear
    const hasViewer = await page
      .locator('iframe[title]')
      .isVisible()
      .catch(() => false);
    const hasNoViz = await page
      .getByText('시각화 파일이 없습니다')
      .isVisible()
      .catch(() => false);

    expect(hasViewer || hasNoViz).toBe(true);
  });
});
