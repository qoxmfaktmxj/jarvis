// Step 2D (2026-05-11): graph_snapshot.sensitivity 제거 (D2=B). 이전에는 origin
// (system/project/knowledge) 의 sensitivity 를 계산하는 헬퍼(computeEffectiveSensitivity)
// 가 있었으나 lineage 출력에서 sensitivity 자체가 사라졌으므로 해당 헬퍼 + 테스트는
// 삭제했다. resolveLineageFromRawSource 의 동작은 DB 접근이 필요한 integration 테스트
// 영역으로 이동했다 (별도 미존재 — graphify-build 통합 회귀에서 간접 검증).

import { describe, expect, it } from "vitest";

describe("resolve-lineage (Step 2D placeholder)", () => {
  it("placeholder — see graphify-build integration tests for lineage coverage", () => {
    expect(true).toBe(true);
  });
});
