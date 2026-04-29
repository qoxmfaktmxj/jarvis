// apps/web/app/(app)/ask/actions.test.ts
// P0-5: evictOldConversations IDOR 수정 테스트
// - 시그니처가 (opts?) 형태로 외부 workspaceId/userId 주입 불가
// - requireSession() 호출 검증
// - db.transaction + pg_advisory_xact_lock 검증
// - MAX_CONVERSATIONS_PER_USER 미만 시 delete 미호출
// - excludeId 옵션 동작

import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

// ---------------------------------------------------------------------------
// vi.hoisted: 모든 mock 함수를 hoisting 전에 정의
// ---------------------------------------------------------------------------
const {
  cookiesMock,
  getSessionMock,
  headersMock,
  dbTransactionMock,
  txSelectMock,
  txDeleteMock,
  txExecuteMock,
} = vi.hoisted(() => {
  const txExecuteMock = vi.fn();
  const txDeleteMock = vi.fn();

  // select chain builder: .from().where().orderBy().limit()
  const txSelectMock = vi.fn();

  const dbTransactionMock = vi.fn();

  return {
    cookiesMock: vi.fn(),
    getSessionMock: vi.fn(),
    headersMock: vi.fn(),
    dbTransactionMock,
    txSelectMock,
    txDeleteMock,
    txExecuteMock,
  };
});

vi.mock("next/headers", () => ({
  headers: headersMock,
  cookies: cookiesMock,
}));

vi.mock("@jarvis/auth/session", () => ({
  getSession: getSessionMock,
}));

vi.mock("@jarvis/shared/constants/ask", () => ({
  MAX_CONVERSATIONS_PER_USER: 20,
}));

// 테스트 내에서 사용할 상수 (위 mock과 동일값 유지)
const MAX = 20;

vi.mock("@jarvis/db/schema", () => ({
  askConversation: {
    id: "conv.id",
    workspaceId: "conv.workspaceId",
    userId: "conv.userId",
    lastMessageAt: "conv.lastMessageAt",
  },
  askMessage: {},
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...args: unknown[]) => ({ op: "and", args })),
  eq: vi.fn((col: unknown, val: unknown) => ({ op: "eq", col, val })),
  ne: vi.fn((col: unknown, val: unknown) => ({ op: "ne", col, val })),
  asc: vi.fn((col: unknown) => ({ op: "asc", col })),
  desc: vi.fn((col: unknown) => ({ op: "desc", col })),
  count: vi.fn(() => ({ op: "count" })),
  inArray: vi.fn((col: unknown, vals: unknown[]) => ({ op: "inArray", col, vals })),
  sql: Object.assign(
    vi.fn((_strings: TemplateStringsArray, ..._values: unknown[]) => ({ op: "sql_raw" })),
    { join: vi.fn(), empty: {} }
  ),
}));

// ---------------------------------------------------------------------------
// db mock: transaction만 사용. transaction 콜백에 tx 객체 전달
// ---------------------------------------------------------------------------
vi.mock("@jarvis/db/client", () => ({
  db: {
    transaction: dbTransactionMock,
    // 다른 함수들은 테스트 대상 함수가 직접 호출하지 않으므로 생략 가능
  },
}));

// ---------------------------------------------------------------------------
// 테스트용 tx 객체 빌더 (count, select, delete, execute 지원)
// ---------------------------------------------------------------------------
function buildTx(countResult: number, selectRows: { id: string }[] = []) {
  // select chain: .from().where().orderBy().limit() → rows
  const limitFn = vi.fn(() => Promise.resolve(selectRows));
  const orderByFn = vi.fn(() => ({ limit: limitFn }));
  const whereFn = vi.fn(() => ({ orderBy: orderByFn, limit: limitFn }));
  const fromFn = vi.fn(() => ({ where: whereFn }));

  // count select: .from().where() → [{ count: N }]
  // 첫 번째 select 호출(count), 두 번째 select 호출(oldest rows) 분기
  let selectCallCount = 0;
  const selectFn = vi.fn(() => {
    selectCallCount++;
    if (selectCallCount === 1) {
      // count query
      const countWhereFn = vi.fn(() =>
        Promise.resolve([{ count: countResult }])
      );
      const countFromFn = vi.fn(() => ({ where: countWhereFn }));
      return { from: countFromFn };
    }
    // oldest rows query
    return { from: fromFn };
  });

  const deleteFn = vi.fn(() => ({
    where: vi.fn(() => Promise.resolve()),
  }));

  const executeFn = txExecuteMock;

  return { select: selectFn, delete: deleteFn, execute: executeFn, _fromFn: fromFn, _whereFn: whereFn, _limitFn: limitFn };
}

// ---------------------------------------------------------------------------
// 세션 헬퍼
// ---------------------------------------------------------------------------
function mockSession(workspaceId = "ws-1", userId = "u-1") {
  headersMock.mockResolvedValue(new Headers({ "x-session-id": "sid-1" }));
  cookiesMock.mockResolvedValue({ get: vi.fn(() => undefined) });
  getSessionMock.mockResolvedValue({
    sessionId: "sid-1",
    workspaceId,
    userId,
    roles: [],
    permissions: [],
  });
}

function mockNoSession() {
  headersMock.mockResolvedValue(new Headers());
  cookiesMock.mockResolvedValue({ get: vi.fn(() => undefined) });
}

// ---------------------------------------------------------------------------
// import actions (after mocks)
// ---------------------------------------------------------------------------
import { evictOldConversations } from "./actions";

describe("evictOldConversations — P0-5 IDOR fix", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    txExecuteMock.mockResolvedValue(undefined);
  });

  // -------------------------------------------------------------------------
  // 1. 시그니처: 외부 workspaceId/userId 인자 없음 (TypeScript 컴파일 레벨)
  //    런타임에서는 opts 없이 호출 가능한지 확인
  // -------------------------------------------------------------------------
  it("accepts call with no arguments", async () => {
    mockSession();
    const tx = buildTx(0); // count < MAX → early return
    dbTransactionMock.mockImplementation(async (cb: (tx: unknown) => Promise<void>) => {
      await cb(tx);
    });

    // 인자 없이 호출 가능해야 함 (IDOR 수정 핵심)
    await expect(evictOldConversations()).resolves.toBeUndefined();
  });

  it("accepts call with { excludeId } option", async () => {
    mockSession();
    const tx = buildTx(0);
    dbTransactionMock.mockImplementation(async (cb: (tx: unknown) => Promise<void>) => {
      await cb(tx);
    });

    await expect(
      evictOldConversations({ excludeId: "conv-abc" })
    ).resolves.toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // 2. requireSession() 호출 검증 — 세션 없으면 throw
  // -------------------------------------------------------------------------
  it("throws Unauthorized when session is missing", async () => {
    mockNoSession();

    await expect(evictOldConversations()).rejects.toThrow("Unauthorized");
    // db.transaction은 호출되지 않아야 함
    expect(dbTransactionMock).not.toHaveBeenCalled();
  });

  it("throws Unauthorized when getSession returns null", async () => {
    headersMock.mockResolvedValue(new Headers({ "x-session-id": "sid-1" }));
    cookiesMock.mockResolvedValue({ get: vi.fn(() => undefined) });
    getSessionMock.mockResolvedValue(null);

    await expect(evictOldConversations()).rejects.toThrow("Unauthorized");
    expect(dbTransactionMock).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 3. db.transaction 진입 검증 + pg_advisory_xact_lock 호출 검증
  // -------------------------------------------------------------------------
  it("enters db.transaction and calls pg_advisory_xact_lock", async () => {
    mockSession("ws-1", "u-1");
    const tx = buildTx(0); // count < MAX
    dbTransactionMock.mockImplementation(async (cb: (tx: unknown) => Promise<void>) => {
      await cb(tx);
    });

    await evictOldConversations();

    expect(dbTransactionMock).toHaveBeenCalledOnce();
    // execute(sql`SELECT pg_advisory_xact_lock(...)`) 호출 검증
    expect(txExecuteMock).toHaveBeenCalledOnce();
  });

  // -------------------------------------------------------------------------
  // 4. count < MAX_CONVERSATIONS_PER_USER 이면 delete 미호출
  // -------------------------------------------------------------------------
  it("does NOT call delete when count < MAX", async () => {
    mockSession();
    const tx = buildTx(MAX - 1); // 19 < 20
    dbTransactionMock.mockImplementation(async (cb: (tx: unknown) => Promise<void>) => {
      await cb(tx);
    });

    await evictOldConversations();

    // delete는 호출되지 않아야 함
    expect(tx.delete).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 5. count >= MAX 이면 oldest rows를 select 후 delete 호출
  // -------------------------------------------------------------------------
  it("calls delete when count >= MAX", async () => {
    mockSession();
    const oldestRows = [{ id: "conv-old-1" }, { id: "conv-old-2" }];
    const tx = buildTx(MAX + 1, oldestRows); // 21 >= 20
    dbTransactionMock.mockImplementation(async (cb: (tx: unknown) => Promise<void>) => {
      await cb(tx);
    });

    await evictOldConversations();

    expect(tx.delete).toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 6. excludeId 옵션 전달 시 ne 조건 추가
  // -------------------------------------------------------------------------
  it("applies ne condition when excludeId is provided", async () => {
    const { ne } = await import("drizzle-orm");
    mockSession();
    const tx = buildTx(MAX + 1, [{ id: "conv-old-1" }]);
    dbTransactionMock.mockImplementation(async (cb: (tx: unknown) => Promise<void>) => {
      await cb(tx);
    });

    await evictOldConversations({ excludeId: "conv-exclude-me" });

    // ne()가 excludeId 인자와 함께 호출됐는지 검증
    expect(ne).toHaveBeenCalledWith(
      expect.anything(),
      "conv-exclude-me"
    );
  });

  // -------------------------------------------------------------------------
  // 7. session에서 추출한 workspaceId/userId를 eq WHERE에 사용
  // -------------------------------------------------------------------------
  it("uses session workspaceId and userId in WHERE clause", async () => {
    const { eq } = await import("drizzle-orm");
    mockSession("ws-correct", "u-correct");
    const tx = buildTx(0);
    dbTransactionMock.mockImplementation(async (cb: (tx: unknown) => Promise<void>) => {
      await cb(tx);
    });

    await evictOldConversations();

    // eq가 session의 workspaceId/userId 값과 함께 호출됐는지 검증
    const eqCalls = (eq as Mock).mock.calls;
    const wsCall = eqCalls.find((c) => c[1] === "ws-correct");
    const userCall = eqCalls.find((c) => c[1] === "u-correct");
    expect(wsCall).toBeDefined();
    expect(userCall).toBeDefined();
  });
});
