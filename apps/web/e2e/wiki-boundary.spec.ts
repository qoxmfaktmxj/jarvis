import { test, expect } from '@playwright/test';
import { loginAsTestUser } from './helpers/auth';

test.describe('Wiki Boundary — auto/ vs manual/ 영역 분리', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page);
  });

  test.skip('auto 영역 직접 파일 쓰기 시도 → 403', async ({ request }) => {
    // TODO: Phase-W2 완료 후 활성화
    // POST /api/wiki/files/auto/... 직접 쓰기 블로킹
    const response = await request.post('/api/wiki/files/auto/default/sample.md', {
      data: { content: 'manual write to auto area' },
    });
    expect(response.status()).toBe(403);
  });

  test.skip('manual 영역 LLM 직접 쓰기 시도 → 403', async ({ request }) => {
    // TODO: Phase-W2 완료 후 활성화
    // worker job이 manual/에 쓰려고 하면 거부
    const response = await request.post('/api/worker/jobs/llm-write', {
      data: {
        target: 'manual/default/sample.md',
        content: 'LLM generated content',
      },
    });
    expect(response.status()).toBe(403);
  });

  test.skip('boundary_violation audit_log 기록 확인', async ({ request }) => {
    // TODO: Phase-W2 완료 후 활성화
    // 위반 후 audit_log 테이블에 레코드 존재
    await request.post('/api/wiki/files/auto/default/violate.md', {
      data: { content: 'violation attempt' },
    });
    const auditResponse = await request.get('/api/audit-log?event=boundary_violation&limit=1');
    expect(auditResponse.status()).toBe(200);
    const body = await auditResponse.json();
    expect(Array.isArray(body.logs)).toBe(true);
    expect(body.logs.length).toBeGreaterThanOrEqual(1);
    expect(body.logs[0]).toMatchObject({ event: 'boundary_violation' });
  });

  test.skip('경계 위반 없는 정상 흐름 — violation 없음', async ({ request }) => {
    // TODO: Phase-W2 완료 후 활성화
    // 정상 ingest에서 audit_log에 violation 없음
    const before = await request.get('/api/audit-log?event=boundary_violation&limit=1');
    const beforeBody = await before.json();
    const beforeLatestId = beforeBody.logs?.[0]?.id ?? null;

    const ingestResponse = await request.post('/api/wiki/ingest', {
      multipart: {
        file: {
          name: 'normal.md',
          mimeType: 'text/markdown',
          buffer: Buffer.from('# Normal\n\nnormal ingest'),
        },
      },
    });
    expect(ingestResponse.status()).toBe(202);

    const after = await request.get('/api/audit-log?event=boundary_violation&limit=1');
    const afterBody = await after.json();
    const afterLatestId = afterBody.logs?.[0]?.id ?? null;
    expect(afterLatestId).toBe(beforeLatestId);
  });
});
