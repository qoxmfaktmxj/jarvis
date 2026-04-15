import { test, expect } from '@playwright/test';
import { loginAsTestUser } from './helpers/auth';

// Canonical UUID — helpers/auth.ts 의 TEST_WORKSPACE_ID 와 동일
const TEST_WORKSPACE_ID = '00000000-0000-0000-0000-000000000001';

test.describe('Wiki Graph — 그래프 뷰어', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page);
  });

  test.skip('로그인된 사용자가 /wiki/{workspaceId}/graph 접근 → 200 OK', async ({ page }) => {
    // TODO: T6+T7 완료 후 활성화
    // 그래프 뷰어 페이지 로드 확인
    const response = await page.goto(`/wiki/${TEST_WORKSPACE_ID}/graph`);
    expect(response?.status()).toBe(200);
    await expect(page.locator('main')).toBeVisible();
  });

  test.skip('GET /api/wiki/graph?workspaceId={id} → 200, nodes[]/edges[] 배열 포함', async ({ request }) => {
    // TODO: T6+T7 완료 후 활성화
    // 그래프 API 응답 shape 검증
    const response = await request.get(`/api/wiki/graph?workspaceId=${TEST_WORKSPACE_ID}`);
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body.nodes)).toBe(true);
    expect(Array.isArray(body.edges)).toBe(true);
  });

  test.skip('MAX_NODES 초과 시 응답에 truncated 필드 포함', async ({ request }) => {
    // TODO: T6+T7 완료 후 활성화
    // 노드 수가 MAX_NODES를 초과하면 truncated=true 로 잘라서 응답
    const response = await request.get(
      `/api/wiki/graph?workspaceId=${TEST_WORKSPACE_ID}&limit=1`,
    );
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty('truncated');
    expect(typeof body.truncated).toBe('boolean');
  });

  test.skip('그래프 필터 쿼리 (?type=concept) → 필터링된 nodes 반환', async ({ request }) => {
    // TODO: T6+T7 완료 후 활성화
    // type 필터 적용 시 해당 타입 노드만 반환
    const response = await request.get(
      `/api/wiki/graph?workspaceId=${TEST_WORKSPACE_ID}&type=concept`,
    );
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body.nodes)).toBe(true);
    for (const node of body.nodes) {
      expect(node.type).toBe('concept');
    }
  });
});
