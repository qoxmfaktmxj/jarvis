/**
 * owner check 회귀 테스트 — saveSchedulesAction updates / deletes
 *
 * 정책:
 *  - SCHEDULE_ADMIN + 본인 이벤트 update → updated = 1
 *  - SCHEDULE_ADMIN + 타인 이벤트 update → updated = 0 (건너뜀)
 *  - SCHEDULE_ADMIN + 타인 이벤트 update + ADMIN_ALL → updated = 1 (슈퍼어드민)
 *  - SCHEDULE_ADMIN + 본인 이벤트 delete → deleted = 1
 *  - SCHEDULE_ADMIN + 타인 이벤트 delete → deleted = 0 (건너뜀)
 *  - SCHEDULE_ADMIN + 타인 이벤트 delete + ADMIN_ALL → deleted = 1 (슈퍼어드민)
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const OWNER_ID = "aaaaaaaa-0000-0000-0000-000000000001";
const OTHER_ID = "bbbbbbbb-0000-0000-0000-000000000002";
const EVENT_ID = "eeeeeeee-0000-0000-0000-000000000005";
const WS_ID = "dddddddd-0000-0000-0000-000000000004";

// ── hoisted mocks ──────────────────────────────────────────────────────────
const {
  getSessionMock,
  cookiesMock,
  headersMock,
  txSelectReturnMock,
  txUpdateReturnMock,
  txDeleteReturnMock,
  txInsertReturnMock,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  cookiesMock: vi.fn(),
  headersMock: vi.fn(),
  txSelectReturnMock: vi.fn(),
  txUpdateReturnMock: vi.fn(),
  txDeleteReturnMock: vi.fn(),
  txInsertReturnMock: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: cookiesMock,
  headers: headersMock,
}));

vi.mock("@jarvis/auth/session", () => ({
  getSession: getSessionMock,
}));

vi.mock("@jarvis/auth", () => ({
  hasPermission: (session: { permissions: string[] }, perm: string) =>
    session.permissions.includes(perm),
}));

vi.mock("@jarvis/db/client", () => ({
  db: {
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn(async () => txSelectReturnMock()),
            })),
          })),
        })),
        insert: vi.fn(() => ({
          values: vi.fn(() => ({
            returning: vi.fn(async () => txInsertReturnMock()),
          })),
        })),
        update: vi.fn(() => ({
          set: vi.fn(() => ({
            where: vi.fn(() => ({
              returning: vi.fn(async () => txUpdateReturnMock()),
            })),
          })),
        })),
        delete: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn(async () => txDeleteReturnMock()),
          })),
        })),
      };
      return fn(tx);
    }),
  },
}));

vi.mock("@jarvis/db/schema", () => ({
  scheduleEvent: { id: "id", workspaceId: "workspace_id", userId: "user_id" },
  auditLog: {},
}));

vi.mock("drizzle-orm", async () => {
  const actual = await vi.importActual<typeof import("drizzle-orm")>("drizzle-orm");
  return {
    ...actual,
    and: vi.fn((...args: unknown[]) => args),
    eq: vi.fn((a: unknown, b: unknown) => ({ a, b })),
  };
});

vi.mock("@/lib/queries/schedule", () => ({
  getScheduleById: vi.fn(),
  listSchedules: vi.fn(),
  listCalendarEvents: vi.fn(),
  nextOrderSeq: vi.fn(async () => 0),
}));

import { saveSchedulesAction } from "./actions";

// ── 공통 헬퍼 ────────────────────────────────────────────────────────────────
function setupSession(userId: string, permissions: string[]) {
  headersMock.mockResolvedValue({ get: () => "sess-1" });
  cookiesMock.mockResolvedValue({ get: () => undefined });
  getSessionMock.mockResolvedValue({
    userId,
    workspaceId: WS_ID,
    roles: ["MEMBER"],
    permissions,
    employeeId: "EMP001",
  });
}

const UPDATE_INPUT = {
  creates: [],
  updates: [{ id: EVENT_ID, title: "Updated" }],
  deletes: [],
};

const DELETE_INPUT = {
  creates: [],
  updates: [],
  deletes: [EVENT_ID],
};

beforeEach(() => {
  vi.clearAllMocks();
  // 기본값: 감사 로그 insert 성공
  txInsertReturnMock.mockReturnValue([]);
});

// ─────────────────────────────────────────────────────────────────────────────
describe("saveSchedulesAction — update owner check", () => {
  it("본인 이벤트 → updated = 1", async () => {
    setupSession(OWNER_ID, ["schedule:admin"]);
    // select → 이벤트 소유자가 OWNER_ID
    txSelectReturnMock.mockReturnValue([{ userId: OWNER_ID }]);
    txUpdateReturnMock.mockReturnValue([{ id: EVENT_ID }]);

    const result = await saveSchedulesAction(UPDATE_INPUT);
    expect(result.ok).toBe(true);
    expect(result.updated).toBe(1);
  });

  it("타인 이벤트 → updated = 0 (건너뜀)", async () => {
    setupSession(OWNER_ID, ["schedule:admin"]);
    // select → 이벤트 소유자가 OTHER_ID
    txSelectReturnMock.mockReturnValue([{ userId: OTHER_ID }]);

    const result = await saveSchedulesAction(UPDATE_INPUT);
    expect(result.ok).toBe(true);
    expect(result.updated).toBe(0);
  });

  it("타인 이벤트 + ADMIN_ALL → updated = 1", async () => {
    setupSession(OWNER_ID, ["schedule:admin", "admin:all"]);
    txSelectReturnMock.mockReturnValue([{ userId: OTHER_ID }]);
    txUpdateReturnMock.mockReturnValue([{ id: EVENT_ID }]);

    const result = await saveSchedulesAction(UPDATE_INPUT);
    expect(result.ok).toBe(true);
    expect(result.updated).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("saveSchedulesAction — delete owner check", () => {
  it("본인 이벤트 → deleted = 1", async () => {
    setupSession(OWNER_ID, ["schedule:admin"]);
    txSelectReturnMock.mockReturnValue([{ userId: OWNER_ID }]);
    txDeleteReturnMock.mockReturnValue([{ id: EVENT_ID }]);

    const result = await saveSchedulesAction(DELETE_INPUT);
    expect(result.ok).toBe(true);
    expect(result.deleted).toBe(1);
  });

  it("타인 이벤트 → deleted = 0 (건너뜀)", async () => {
    setupSession(OWNER_ID, ["schedule:admin"]);
    txSelectReturnMock.mockReturnValue([{ userId: OTHER_ID }]);

    const result = await saveSchedulesAction(DELETE_INPUT);
    expect(result.ok).toBe(true);
    expect(result.deleted).toBe(0);
  });

  it("타인 이벤트 + ADMIN_ALL → deleted = 1", async () => {
    setupSession(OWNER_ID, ["schedule:admin", "admin:all"]);
    txSelectReturnMock.mockReturnValue([{ userId: OTHER_ID }]);
    txDeleteReturnMock.mockReturnValue([{ id: EVENT_ID }]);

    const result = await saveSchedulesAction(DELETE_INPUT);
    expect(result.ok).toBe(true);
    expect(result.deleted).toBe(1);
  });
});
