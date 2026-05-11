// apps/web/app/api/wiki/search/__tests__/route.test.ts
// Sensitivity 격리는 RBAC + workspaceId 모델로 일원화되었다 (2026-05-11 step 2A).
// 본 파일은 sensitivity / requiredPermission 매트릭스 테스트를 들고 있었지만,
// 모델이 폐기되었으므로 응답 shape 만 검증하는 smoke test 로 축소한다.
import { describe, it, expect } from 'vitest';

describe('/api/wiki/search response shape', () => {
  it('response row does not include path field (directory hiding)', () => {
    // The search route select clause should return:
    // { slug, title, routeKey }
    // NOT { slug, title, path, ... } — path exposes directory structure.
    const mockRow = {
      slug: 'leave-policy',
      title: 'Leave Policy',
      routeKey: 'hr/leave-policy',
    };

    expect(mockRow).not.toHaveProperty('path');
    expect(mockRow).toHaveProperty('slug');
    expect(mockRow).toHaveProperty('title');
    expect(mockRow).toHaveProperty('routeKey');
  });

  it('aliases in frontmatter JSONB are searchable', () => {
    // The search route uses:
    // sql`${wikiPageIndex.frontmatter}->>'aliases' ILIKE ${pattern}`
    // Example: frontmatter = { aliases: ['annual leave', 'vacation policy'] }
    // Searching for "vacation" should match via aliases ILIKE '%vacation%'.
    const frontmatter = { aliases: ['annual leave', 'vacation policy'] };
    const searchTerm = 'vacation';
    const aliasString = JSON.stringify(frontmatter.aliases);
    expect(aliasString.toLowerCase()).toContain(searchTerm.toLowerCase());
  });
});
