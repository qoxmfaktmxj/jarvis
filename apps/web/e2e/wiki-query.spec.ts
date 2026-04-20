import { test, expect } from '@playwright/test';
import { loginAsTestUser } from './helpers/auth';

test.describe('Wiki Query — Page-First RAG Pipeline', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page);
  });

  test('page-first shortlist 반환 — smoke', async ({ page }) => {
    // Smoke test: POST /api/wiki/query — accept 200 (implemented) or 404
    // (Phase-W2 pending; route not yet created). When 200, assert the
    // shape is `{ pages: [...] }` so a regression in response shape is caught.
    // NOTE: Use `page.request` (not the top-level `request` fixture) so the
    // auth cookie set by `loginAsTestUser(page)` is inherited. The fixture
    // `request` runs in its own context with no session, gets redirected to
    // /login, and returns HTML instead of JSON.
    const response = await page.request.post('/api/wiki/query', {
      data: { query: '회사 휴가 정책' },
    });
    expect([200, 404]).toContain(response.status());
    if (response.status() === 200) {
      const body = await response.json();
      expect(Array.isArray(body.pages)).toBe(true);
    }
  });

  test.skip('shortlist → read → 답변 생성 — 전체 RAG 파이프라인', async ({ request }) => {
    // TODO: Phase-W2 완료 후 활성화
    // 전체 RAG 파이프라인 응답 검증
    const response = await request.post('/api/wiki/ask', {
      data: { query: '출장 경비 한도는?' },
    });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty('content');
    expect(typeof body.content).toBe('string');
    expect(body.content.length).toBeGreaterThan(0);
  });

  test.skip('인용(citation) sourceRef 포함 확인', async ({ request }) => {
    // TODO: Phase-W2 완료 후 활성화
    // 응답 content에 [[...]] 형태 sourceRef 존재
    const response = await request.post('/api/wiki/ask', {
      data: { query: '정보보안 규정' },
    });
    const body = await response.json();
    expect(body.content).toMatch(/\[\[.+?\]\]/);
  });

  test.skip('sensitivity=internal 페이지 — 권한 없는 사용자 필터링', async ({ request }) => {
    // TODO: Phase-W2 완료 후 활성화
    // 권한 없는 사용자: 403 또는 빈 pages[]
    const response = await request.post('/api/wiki/query', {
      data: { query: '내부 임원 회의록' },
    });
    if (response.status() === 403) {
      expect(response.status()).toBe(403);
    } else {
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.pages).toEqual([]);
    }
  });
});
