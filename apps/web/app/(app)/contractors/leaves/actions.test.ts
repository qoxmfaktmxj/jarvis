import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  leaveBatchInputSchema,
  validateBatchBusinessRules,
  type LeaveBatchInput
} from "./actions.validators.js";

// ── constants ────────────────────────────────────────────────────────────────
const WS_ID = "aaaaaaaa-0000-0000-0000-000000000001";
const OTHER_WS_ID = "bbbbbbbb-0000-0000-0000-000000000002";
const TEST_CONTRACT_ID = "cccccccc-0000-0000-0000-000000000003";
const OTHER_WORKSPACE_CONTRACT_ID = "dddddddd-0000-0000-0000-000000000004";
const LEAVE_ID_1 = "eeeeeeee-0000-0000-0000-000000000005";
const LEAVE_ID_2 = "ffffffff-0000-0000-0000-000000000006";

// ── hoisted mocks ──────────────────────────────────────────────────────────
const { getSessionMock, headersMock, dbSelectMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  headersMock: vi.fn(),
  dbSelectMock: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: headersMock,
  cookies: vi.fn(async () => ({ get: () => undefined })),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));

vi.mock("@jarvis/auth/session", () => ({
  getSession: getSessionMock,
}));

vi.mock("@jarvis/auth/rbac", () => ({
  hasPermission: (session: { permissions: string[] }, perm: string) =>
    session.permissions.includes(perm),
}));

vi.mock("@jarvis/auth", () => ({
  hasPermission: (session: { permissions: string[] }, perm: string) =>
    session.permissions.includes(perm),
}));

vi.mock("@jarvis/db/client", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => dbSelectMock()),
          orderBy: vi.fn(async () => dbSelectMock()),
        })),
      })),
    })),
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        insert: vi.fn(() => ({ values: vi.fn(async () => undefined) })),
        update: vi.fn(() => ({
          set: vi.fn(() => ({
            where: vi.fn(() => ({
              returning: vi.fn(async () => []),
            })),
          })),
        })),
      };
      return fn(tx);
    }),
  },
}));

vi.mock("@jarvis/db/schema", () => ({
  contractorContract: {
    id: "id",
    workspaceId: "workspace_id",
    userId: "user_id",
  },
  leaveRequest: {
    id: "id",
    workspaceId: "workspace_id",
    contractId: "contract_id",
    type: "type",
    startDate: "start_date",
    endDate: "end_date",
    hours: "hours",
    reason: "reason",
    status: "status",
    createdAt: "created_at",
    cancelledAt: "cancelled_at",
  },
  auditLog: {},
}));

vi.mock("drizzle-orm", async () => {
  const actual = await vi.importActual<typeof import("drizzle-orm")>("drizzle-orm");
  return {
    ...actual,
    and: vi.fn((...args: unknown[]) => args),
    eq: vi.fn((a: unknown, b: unknown) => ({ a, b })),
    inArray: vi.fn((a: unknown, b: unknown) => ({ a, b })),
    desc: vi.fn((a: unknown) => ({ desc: a })),
  };
});

// ── helper ────────────────────────────────────────────────────────────────
function setupSession(workspaceId = WS_ID) {
  headersMock.mockResolvedValue({ get: () => "sess-1" });
  getSessionMock.mockResolvedValue({
    userId: "user-1",
    workspaceId,
    roles: ["MEMBER"],
    permissions: ["user:read"],
    employeeId: "EMP001",
  });
}

// ── existing validator tests ──────────────────────────────────────────────

describe("leaveBatchInputSchema", () => {
  it("accepts minimal batch", () => {
    const parsed = leaveBatchInputSchema.parse({
      contractId: "00000000-0000-0000-0000-000000000001",
      inserts: [],
      cancels: []
    });
    expect(parsed.inserts).toEqual([]);
  });
  it("rejects invalid type", () => {
    expect(() =>
      leaveBatchInputSchema.parse({
        contractId: "00000000-0000-0000-0000-000000000001",
        inserts: [
          {
            type: "weird",
            startDate: "2026-04-23",
            endDate: "2026-04-23",
            hours: 8
          }
        ],
        cancels: []
      })
    ).toThrow();
  });
  it("accepts type='hourly'", () => {
    expect(() =>
      leaveBatchInputSchema.parse({
        contractId: TEST_CONTRACT_ID,
        inserts: [
          {
            type: "hourly",
            startDate: "2026-05-17",
            endDate: "2026-05-17",
            hours: 2,
            reason: "회의",
          },
        ],
        cancels: [],
      })
    ).not.toThrow();
  });
});

describe("validateBatchBusinessRules", () => {
  it("rejects start>end", () => {
    expect(() =>
      validateBatchBusinessRules({
        contractId: "c",
        inserts: [
          {
            type: "annual",
            startDate: "2026-04-25",
            endDate: "2026-04-20",
            hours: 8
          }
        ],
        cancels: []
      })
    ).toThrow();
  });
  it("rejects hours <= 0", () => {
    expect(() =>
      validateBatchBusinessRules({
        contractId: "c",
        inserts: [
          {
            type: "annual",
            startDate: "2026-04-23",
            endDate: "2026-04-23",
            hours: 0
          }
        ],
        cancels: []
      })
    ).toThrow();
  });
});

describe("leaveBatchInputSchema — cancel UUIDs", () => {
  it("accepts valid cancel UUIDs", () => {
    const input: LeaveBatchInput = leaveBatchInputSchema.parse({
      contractId: "00000000-0000-0000-0000-000000000001",
      inserts: [],
      cancels: ["00000000-0000-0000-0000-000000000002"]
    });
    expect(input.cancels).toHaveLength(1);
    expect(input.cancels[0]).toBe("00000000-0000-0000-0000-000000000002");
  });
  it("rejects non-UUID cancel ids", () => {
    expect(() =>
      leaveBatchInputSchema.parse({
        contractId: "00000000-0000-0000-0000-000000000001",
        inserts: [],
        cancels: ["not-a-uuid"]
      })
    ).toThrow();
  });
});

// ── listLeaveRequestsForContract tests ────────────────────────────────────

import { listLeaveRequestsForContract } from "./actions.js";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listLeaveRequestsForContract", () => {
  it("returns rows scoped to contract + workspace", async () => {
    setupSession();
    // 첫 번째 select: contract ownership check
    const now = new Date("2026-05-01T00:00:00.000Z");
    dbSelectMock
      .mockReturnValueOnce([{ id: TEST_CONTRACT_ID, workspaceId: WS_ID }])
      // 두 번째 select: leave_request 목록
      .mockReturnValueOnce([
        {
          id: LEAVE_ID_1,
          type: "annual",
          startDate: "2026-04-01",
          endDate: "2026-04-01",
          hours: "8",
          reason: null,
          status: "approved",
          appliedAt: now,
          cancelledAt: null,
        },
        {
          id: LEAVE_ID_2,
          type: "halfAm",
          startDate: "2026-04-10",
          endDate: "2026-04-10",
          hours: "4",
          reason: "병원",
          status: "cancelled",
          appliedAt: now,
          cancelledAt: now,
        },
      ]);

    const res = await listLeaveRequestsForContract({ contractId: TEST_CONTRACT_ID });
    expect(res.ok).toBe(true);
    expect(res.rows).toHaveLength(2);
    expect(res.rows[0]).toMatchObject({
      id: expect.any(String),
      type: expect.any(String),
      startDate: expect.any(String),
      endDate: expect.any(String),
      hours: expect.any(Number),
      status: expect.stringMatching(/^(active|cancelled)$/),
    });
  });

  it("rejects contract from another workspace", async () => {
    setupSession();
    // contract ownership check: workspaceId가 OTHER_WS_ID
    dbSelectMock.mockReturnValueOnce([
      { id: OTHER_WORKSPACE_CONTRACT_ID, workspaceId: OTHER_WS_ID },
    ]);

    await expect(
      listLeaveRequestsForContract({ contractId: OTHER_WORKSPACE_CONTRACT_ID })
    ).rejects.toThrow(/forbidden/);
  });
});
