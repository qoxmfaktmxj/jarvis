import { test, expect } from '@playwright/test';
import { loginAsTestUser } from './helpers/auth';

// Canonical UUID — helpers/auth.ts 의 TEST_WORKSPACE_ID 와 동일
const TEST_WORKSPACE_ID = '00000000-0000-0000-0000-000000000001';

test.describe('Wiki Viewer — 읽기 전용 RSC 뷰어', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page);
  });

  test.skip('로그인된 사용자가 /wiki/{workspaceId}/overview 접근 → 200 OK', async ({ page }) => {
    // TODO: T6 완료 후 활성화
    // RSC 뷰어 페이지 로드 확인 (overview 경로)
    const response = await page.goto(`/wiki/${TEST_WORKSPACE_ID}/overview`);
    expect(response?.status()).toBe(200);
    await expect(page.locator('main')).toBeVisible();
  });

  test.skip('GET /api/wiki/pages/{path} → 200, title/content 포함', async ({ request }) => {
    // TODO: T6 완료 후 활성화
    // 페이지 단건 조회 API 응답 shape 검증
    const response = await request.get(`/api/wiki/pages/overview?workspaceId=${TEST_WORKSPACE_ID}`);
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty('title');
    expect(body).toHaveProperty('content');
    expect(typeof body.title).toBe('string');
    expect(typeof body.content).toBe('string');
  });

  test.skip('sensitivity=internal 페이지 — 권한 없는 사용자 403 또는 빈 콘텐츠', async ({ request }) => {
    // TODO: T6 완료 후 활성화
    // VIEWER 권한: internal 페이지 접근 차단
    const response = await request.get(
      `/api/wiki/pages/internal/exec-minutes?workspaceId=${TEST_WORKSPACE_ID}`,
    );
    if (response.status() === 403) {
      expect(response.status()).toBe(403);
    } else {
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.content ?? '').toBe('');
    }
  });

  test.skip('존재하지 않는 경로 → 404', async ({ request }) => {
    // TODO: T6 완료 후 활성화
    // 미존재 path 조회 시 404
    const response = await request.get(
      `/api/wiki/pages/does-not-exist-${Date.now()}?workspaceId=${TEST_WORKSPACE_ID}`,
    );
    expect(response.status()).toBe(404);
  });
});
