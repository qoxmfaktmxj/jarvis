// apps/web/app/api/ask/route.persist.test.ts
// HIGH-3: ask route 메시지 영속화 로직이 db.transaction 안에서 실행됨을 검증
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- mocks ---------------------------------------------------------------

vi.mock('@jarvis/db/client', () => ({
  db: {
    transaction: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    select: vi.fn(),
  },
}));

vi.mock('@jarvis/db/schema', () => ({
  askMessage: {},
  askConversation: { id: 'id', messageCount: 'message_count', workspaceId: 'workspace_id', userId: 'user_id' },
}));

vi.mock('@jarvis/ai/ask', () => ({
  askAI: vi.fn(),
}));

vi.mock('@/lib/server/rate-limit', () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true }),
}));

vi.mock('@/lib/server/api-auth', () => ({
  requireApiSession: vi.fn().mockResolvedValue({
    session: {
      userId: 'u-1',
      workspaceId: 'ws-1',
      roles: ['USER'],
      permissions: ['knowledge:read'],
    },
  }),
}));

vi.mock('@/app/(app)/ask/actions', () => ({
  evictOldConversations: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((a: unknown, b: unknown) => ({ eq: [a, b] })),
  sql: Object.assign(
    vi.fn((strings: TemplateStringsArray, ...vals: unknown[]) => ({ sql: strings, vals })),
    { raw: vi.fn((s: string) => ({ raw: s })) }
  ),
}));

// ---- imports after mocks -------------------------------------------------

import { db } from '@jarvis/db/client';
import { askAI } from '@jarvis/ai/ask';
import { NextRequest } from 'next/server';
import { POST } from './route';

async function* makeStream(events: object[]) {
  for (const ev of events) {
    yield ev;
  }
}

describe('/api/ask route — persistence transaction (HIGH-3)', () => {
  let txInsert: ReturnType<typeof vi.fn>;
  let txUpdate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    txInsert = vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });
    txUpdate = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
    });

    // transaction은 콜백을 즉시 실행하는 패스스루 mock
    (db.transaction as ReturnType<typeof vi.fn>).mockImplementation(
      async (cb: (tx: unknown) => Promise<void>) => {
        const tx = { insert: txInsert, update: txUpdate };
        await cb(tx);
      }
    );

    // 새 대화 INSERT .returning() — { id } 반환
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: 'conv-new-id' }]),
      }),
    });

    (askAI as ReturnType<typeof vi.fn>).mockReturnValue(
      makeStream([
        { type: 'answer', delta: 'Hello' },
        { type: 'done', totalTokens: 10 },
      ])
    );
  });

  it('wraps insert + update in a single db.transaction when stream succeeds', async () => {
    // conversationId 없음 → 새 대화 생성 경로
    const req = new NextRequest('http://localhost/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-session-id': 'sess-1' },
      body: JSON.stringify({ question: 'test question' }),
    });

    const response = await POST(req);
    // 스트림 완전 소비
    const reader = response.body?.getReader();
    if (reader) {
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }
    }

    // db.transaction이 정확히 1회 호출됨
    expect(db.transaction).toHaveBeenCalledTimes(1);

    // 콜백 내 tx.insert + tx.update가 모두 호출됨
    expect(txInsert).toHaveBeenCalledTimes(1);
    expect(txUpdate).toHaveBeenCalledTimes(1);
  });

  it('does not call db.transaction when stream emits no success/error events', async () => {
    // 이벤트 없는 스트림 (조기 disconnect 시뮬레이션)
    (askAI as ReturnType<typeof vi.fn>).mockReturnValue(makeStream([]));

    const req = new NextRequest('http://localhost/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-session-id': 'sess-1' },
      body: JSON.stringify({ question: 'test question' }),
    });

    const response = await POST(req);
    const reader = response.body?.getReader();
    if (reader) {
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }
    }

    // shouldPersist = false이므로 transaction 호출 안 됨
    expect(db.transaction).not.toHaveBeenCalled();
  });
});
