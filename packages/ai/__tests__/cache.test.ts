import { afterEach, describe, expect, it } from 'vitest';
import {
  __resetCacheForTests,
  getCached,
  makeCacheKey,
  setCached,
} from '../cache.js';

const base = {
  promptVersion: '2026-04-v1',
  workspaceId: '00000000-0000-0000-0000-00000000000a',
  sensitivityScope:
    'workspace:00000000-0000-0000-0000-00000000000a|level:internal',
  input: 'hello world',
  model: 'gpt-5.4-mini',
};

afterEach(() => __resetCacheForTests());

describe('makeCacheKey', () => {
  it('is deterministic for identical params', () => {
    expect(makeCacheKey(base)).toBe(makeCacheKey({ ...base }));
  });

  it('differs by workspaceId (isolation invariant)', () => {
    const other = {
      ...base,
      workspaceId: '00000000-0000-0000-0000-00000000000b',
    };
    expect(makeCacheKey(base)).not.toBe(makeCacheKey(other));
  });

  it('differs by promptVersion', () => {
    expect(makeCacheKey(base)).not.toBe(
      makeCacheKey({ ...base, promptVersion: '2026-05-v2' }),
    );
  });

  it('differs by sensitivityScope even with same workspaceId', () => {
    expect(makeCacheKey(base)).not.toBe(
      makeCacheKey({
        ...base,
        sensitivityScope:
          'workspace:00000000-0000-0000-0000-00000000000a|level:confidential',
      }),
    );
  });

  // P1 #2 — permissionFingerprint 누락 회귀 방지.
  // 같은 sensitivityScope 안에서 permission profile 이 다른 두 사용자가 같은 캐시
  // 엔트리를 공유하지 않도록, fingerprint 가 키에 반영돼야 한다.
  it('differs by permissionFingerprint (P1 #2 — ACL leak guard)', () => {
    const userA = { ...base, permissionFingerprint: 'knowledge:read,knowledge:update' };
    const userB = { ...base, permissionFingerprint: 'knowledge:read,wiki:restricted_read' };
    expect(makeCacheKey(userA)).not.toBe(makeCacheKey(userB));
  });

  it('treats undefined permissionFingerprint distinctly from defined one', () => {
    const noPerm = { ...base }; // permissionFingerprint undefined
    const withPerm = { ...base, permissionFingerprint: 'knowledge:read' };
    expect(makeCacheKey(noPerm)).not.toBe(makeCacheKey(withPerm));
  });

  it('is stable across serialization orderings', () => {
    const reordered = {
      model: base.model,
      input: base.input,
      sensitivityScope: base.sensitivityScope,
      workspaceId: base.workspaceId,
      promptVersion: base.promptVersion,
    } as typeof base;
    expect(makeCacheKey(base)).toBe(makeCacheKey(reordered));
  });
});

describe('LRU cache', () => {
  it('returns previously stored values', async () => {
    const k = makeCacheKey(base);
    await setCached(k, 'answer');
    expect(await getCached(k)).toBe('answer');
  });

  it('evicts the oldest entry after exceeding cap 500', async () => {
    const firstKey = makeCacheKey({ ...base, input: 'q-0' });
    await setCached(firstKey, 'v-0');
    for (let i = 1; i <= 500; i++) {
      const k = makeCacheKey({ ...base, input: `q-${i}` });
      await setCached(k, `v-${i}`);
    }
    expect(await getCached(firstKey)).toBeNull();
    const lastKey = makeCacheKey({ ...base, input: 'q-500' });
    expect(await getCached(lastKey)).toBe('v-500');
  });
});
