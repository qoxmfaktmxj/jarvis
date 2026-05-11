import { describe, expect, it } from 'vitest';
import { toCaseSourceRef, type RetrievedCase } from './case-context.js';

// Step 2D (2026-05-11): sensitivity 모델 제거 (D2=B) — case 도메인은 RBAC + workspaceId 만 사용.
// 기존 getCaseSensitivityPolicy 테스트는 삭제됨. retrieveRelevantCases 의 실제 DB 호출은
// integration 테스트(`packages/ai/__tests__/case-context.integration.test.ts` — 미존재)에서 검증.

describe('toCaseSourceRef', () => {
  it('maps RetrievedCase fields onto CaseSourceRef shape', () => {
    const c: RetrievedCase = {
      id: 'case-1',
      title: '연차 신청 오류',
      symptom: '잔여 일수 표시 안 됨',
      cause: '캐시 누락',
      action: '캐시 재계산',
      result: 'resolved',
      requestCompany: 'ACME',
      clusterId: 7,
      clusterLabel: '근태 / 연차',
      isDigest: true,
      higherCategory: '근태',
      lowerCategory: '연차',
      vectorSim: 0,
      hybridScore: 0.5,
    };
    const ref = toCaseSourceRef(c);
    expect(ref.kind).toBe('case');
    expect(ref.caseId).toBe('case-1');
    expect(ref.title).toBe('연차 신청 오류');
    expect(ref.confidence).toBe(0.5);
  });
});
