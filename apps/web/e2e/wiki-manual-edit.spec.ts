import { test, expect } from '@playwright/test';
import { loginAsTestUser } from './helpers/auth';

test.describe('Wiki Manual Edit — Tiptap Editor', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page);
  });

  test.skip('manual 편집 페이지 접근 — /wiki/manual/[workspaceId]/edit/[path]', async ({ page }) => {
    // TODO: Phase-W2 완료 후 활성화
    // 에디터 컴포넌트 렌더 확인
    await page.goto('/wiki/manual/default/edit/test-page');
    await expect(page).toHaveURL(/\/wiki\/manual\/.+\/edit\/.+/);
    await expect(page.locator('[data-testid="tiptap-editor"]')).toBeVisible();
  });

  test.skip('Tiptap 편집 → 저장 → 마크다운 파일 갱신', async ({ page, request }) => {
    // TODO: Phase-W2 완료 후 활성화
    // 편집 후 파일 내용 변경 확인
    await page.goto('/wiki/manual/default/edit/test-page');
    const editor = page.locator('[data-testid="tiptap-editor"] [contenteditable="true"]');
    await editor.fill('edited content via tiptap');
    await page.getByRole('button', { name: /저장/ }).click();

    const fileResponse = await request.get('/api/wiki/files/manual/default/test-page.md');
    expect(fileResponse.status()).toBe(200);
    const body = await fileResponse.text();
    expect(body).toContain('edited content via tiptap');
  });

  test.skip('[[wikilink]] 자동완성 — 2글자 입력 시 드롭다운 표시', async ({ page }) => {
    // TODO: Phase-W2 완료 후 활성화
    // dropdown 존재 확인
    await page.goto('/wiki/manual/default/edit/test-page');
    const editor = page.locator('[data-testid="tiptap-editor"] [contenteditable="true"]');
    await editor.click();
    await page.keyboard.type('[[회사');
    await expect(page.locator('[data-testid="wikilink-autocomplete-dropdown"]')).toBeVisible();
  });

  test.skip('auto/ 경로에 manual 편집 UI 없음 — 라우팅 분리 확인', async ({ page }) => {
    // TODO: Phase-W2 완료 후 활성화
    // /wiki/auto/... 접근 시 404 또는 리디렉트
    const response = await page.goto('/wiki/auto/default/edit/sample');
    const status = response?.status() ?? 0;
    const url = page.url();
    const isNotFound = status === 404;
    const isRedirected = !/\/wiki\/auto\/.+\/edit\/.+/.test(url);
    expect(isNotFound || isRedirected).toBe(true);
  });
});
