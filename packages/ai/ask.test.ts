// packages/ai/ask.test.ts
// Phase-Harness (2026-04-23): embedding 기반 retrieveRelevantClaims 테스트
// 블록 제거. 함수는 ask.ts 에 빈 배열 반환 stub 으로만 남아 있으며, 호출처
// 정리는 Phase G (ask.ts 전면 재작성) 에서 마무리한다.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { askAI } from './ask.js';
import * as graphContextModule from './graph-context.js';

vi.mock('@jarvis/db/client', () => ({
  db: {
    execute: vi.fn(),
    insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) })),
  },
}));

describe('askAI snapshotId propagation', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let graphSpy: ReturnType<typeof vi.spyOn<any, any>>;

  beforeEach(async () => {
    const { db } = await import('@jarvis/db/client');
    // Stub vector + fts queries with empty rows so retrieveRelevantClaims
    // returns [] without hitting a real DB.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(db.execute).mockResolvedValue({ rows: [] } as any);

    // Stub graph retriever so the orchestrator doesn't hit graph_snapshot.
    // We only care about the call shape, not the returned value.
    graphSpy = vi
      .spyOn(graphContextModule, 'retrieveRelevantGraphContext')
      .mockResolvedValue(null);
  });

  afterEach(async () => {
    graphSpy.mockRestore();
    const { db } = await import('@jarvis/db/client');
    vi.mocked(db.execute).mockReset();
  });

  it('passes query.snapshotId into retrieveRelevantGraphContext options', async () => {
    const generator = askAI({
      question: 'architecture graph auth service dependency',
      workspaceId: 'ws-test',
      userId: 'user-test',
      userRoles: ['MEMBER'],
      userPermissions: [PERMISSIONS.KNOWLEDGE_READ, PERMISSIONS.GRAPH_READ],
      snapshotId: 'explicit-snap-1',
    });

    // Drain the generator. With both retrieval results empty, askAI emits the
    // "no info found" fallback (text → sources → done) and never invokes the
    // Anthropic SDK. That keeps the test hermetic.
    for await (const _event of generator) {
      // no-op — we just want the spy to register
    }

    expect(graphSpy).toHaveBeenCalledTimes(1);
    expect(graphSpy).toHaveBeenCalledWith(
      'architecture graph auth service dependency',
      'ws-test',
      { explicitSnapshotId: 'explicit-snap-1', permissions: [PERMISSIONS.KNOWLEDGE_READ, PERMISSIONS.GRAPH_READ] },
    );
  });

  it('still calls retrieveRelevantGraphContext with undefined explicitSnapshotId when query.snapshotId is omitted', async () => {
    const generator = askAI({
      question: 'architecture graph jarvis',
      workspaceId: 'ws-test',
      userId: 'user-test',
      userRoles: ['MEMBER'],
      userPermissions: [PERMISSIONS.KNOWLEDGE_READ, PERMISSIONS.GRAPH_READ],
    });

    for await (const _event of generator) {
      // drain
    }

    expect(graphSpy).toHaveBeenCalledTimes(1);
    expect(graphSpy).toHaveBeenCalledWith(
      'architecture graph jarvis',
      'ws-test',
      { explicitSnapshotId: undefined, permissions: [PERMISSIONS.KNOWLEDGE_READ, PERMISSIONS.GRAPH_READ] },
    );
  });

  it('does not call retrieveRelevantGraphContext without graph read permission', async () => {
    const generator = askAI({
      question: 'architecture graph jarvis',
      workspaceId: 'ws-test',
      userId: 'user-test',
      userRoles: ['MEMBER'],
      userPermissions: [PERMISSIONS.KNOWLEDGE_READ],
    });

    for await (const _event of generator) {
      // drain
    }

    expect(graphSpy).not.toHaveBeenCalled();
  });
});
