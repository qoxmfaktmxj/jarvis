// packages/ai/__tests__/wiki-ops-cache.test.ts
// Phase-W1 T5 (Track B2): cache key에 op + promptVersion이 포함되는지 검증.
//
// 불변식:
//   1) 같은 input/workspace/scope/model/promptVersion 이라도 op가 다르면 key가 달라야 한다.
//   2) promptVersion만 달라도 key가 달라야 한다 (기존 검증 재보강).
//   3) op를 생략한 레거시 호출은 기존 키와 변함없이 작동 (후방 호환).
import { afterEach, describe, expect, it } from "vitest";
import {
  __resetCacheForTests,
  getCached,
  makeCacheKey,
  setCached,
} from "../cache.js";
import { WIKI_OPS } from "@jarvis/shared/constants";

const base = {
  promptVersion: "2026-04-v1",
  workspaceId: "00000000-0000-0000-0000-0000000000aa",
  sensitivityScope:
    "workspace:00000000-0000-0000-0000-0000000000aa|level:internal|graph:0",
  input: "휴가 정책이 뭐야?",
  model: "gpt-5.4-mini",
};

afterEach(() => __resetCacheForTests());

describe("makeCacheKey includes op", () => {
  it("differs when op differs (wiki.query.synthesis vs ask legacy)", () => {
    const legacyKey = makeCacheKey(base);
    const wikiKey = makeCacheKey({ ...base, op: "wiki.query.synthesis" });
    expect(legacyKey).not.toBe(wikiKey);
  });

  it("produces distinct keys for all 6 wiki ops sharing same input", () => {
    const keys = new Set<string>();
    for (const op of WIKI_OPS) {
      keys.add(makeCacheKey({ ...base, op }));
    }
    expect(keys.size).toBe(WIKI_OPS.length);
  });

  it("legacy (no-op) key stays stable for back-compat", () => {
    const k1 = makeCacheKey(base);
    const k2 = makeCacheKey({ ...base });
    expect(k1).toBe(k2);
  });

  it("promptVersion bump still invalidates per op", () => {
    const v1 = makeCacheKey({ ...base, op: "wiki.query.synthesis" });
    const v2 = makeCacheKey({
      ...base,
      op: "wiki.query.synthesis",
      promptVersion: "2026-05-v2",
    });
    expect(v1).not.toBe(v2);
  });
});

describe("LRU cache interacts with op-keyed entries", () => {
  it("wiki and non-wiki responses can coexist without collision", async () => {
    const legacyKey = makeCacheKey(base);
    const wikiKey = makeCacheKey({ ...base, op: "wiki.query.synthesis" });
    await setCached(legacyKey, "legacy-answer");
    await setCached(wikiKey, "wiki-answer");
    expect(await getCached(legacyKey)).toBe("legacy-answer");
    expect(await getCached(wikiKey)).toBe("wiki-answer");
  });
});
