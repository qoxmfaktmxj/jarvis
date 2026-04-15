import { test, expect } from '@playwright/test';
import { loginAsTestUser } from './helpers/auth';

test.describe('Wiki Ingest — Two-Step CoT Pipeline', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page);
  });

  test.skip('파일 업로드 → Two-Step CoT 파이프라인 시작', async ({ page, request }) => {
    // TODO: Phase-W2 완료 후 활성화
    // POST /api/wiki/ingest 로 파일 업로드 후 jobId 반환 확인
    const response = await request.post('/api/wiki/ingest', {
      multipart: {
        file: {
          name: 'sample.md',
          mimeType: 'text/markdown',
          buffer: Buffer.from('# Sample\n\ncontent'),
        },
      },
    });
    expect(response.status()).toBe(202);
    const body = await response.json();
    expect(body).toHaveProperty('jobId');
    expect(typeof body.jobId).toBe('string');
  });

  test.skip('ingest 완료 후 wiki_pages 레코드 생성 확인', async ({ request }) => {
    // TODO: Phase-W2 완료 후 활성화
    // GET /api/wiki/pages 로 expectedPageUpdatesMin 충족 확인
    const response = await request.get('/api/wiki/pages');
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body.pages)).toBe(true);
    const expectedPageUpdatesMin = 1;
    expect(body.pages.length).toBeGreaterThanOrEqual(expectedPageUpdatesMin);
  });

  test.skip('multi-page update — 기존 페이지 갱신 + 신규 페이지 생성', async ({ request }) => {
    // TODO: Phase-W2 완료 후 활성화
    // 기존 페이지 갱신 → 200, 신규 페이지 생성 → 201
    const updateResponse = await request.put('/api/wiki/pages/existing-page-id', {
      data: { content: 'updated content' },
    });
    expect(updateResponse.status()).toBe(200);

    const createResponse = await request.post('/api/wiki/pages', {
      data: { path: 'new-page', content: 'new content' },
    });
    expect(createResponse.status()).toBe(201);
  });
});
