// packages/ai/__tests__/wiki-ops-budget.test.ts
// Phase-W1 T5 (Track B2): wiki.* op이 workspace 일일 예산에 자동 합산되는지 검증.
//
// 핵심 불변식:
//   assertBudget은 op 필터 없이 workspace + status='ok' + today로 합산한다.
//   따라서 ask/embed/wiki.* 모두 동일 workspace에서 SUM(cost_usd)에 참여해야 한다.
//   op별 별도 예산은 Phase-W4 이전 도입하지 않는다 (WIKI-AGENTS §8).

import { describe, it, expect, vi, beforeEach } from "vitest";

const executeMock = vi.fn();

vi.mock("@jarvis/db/client", () => ({
  db: { execute: executeMock },
}));

describe("assertBudget treats wiki.* ops as part of the same daily budget", () => {
  beforeEach(() => {
    executeMock.mockReset();
    process.env.LLM_DAILY_BUDGET_USD = "1.00";
  });

  it("does not filter by op — query selects all statuses='ok' rows today", async () => {
    executeMock.mockResolvedValue({ rows: [{ total: "0.50" }] });
    const { assertBudget } = await import("../budget.js");

    await expect(
      assertBudget("00000000-0000-0000-0000-0000000000aa"),
    ).resolves.toBeUndefined();

    // 실제 실행된 SQL에 op 필터가 없어야 한다.
    // (drizzle sql template은 queryChunks 배열로 직렬화되므로 문자열로 조인해서 검사)
    expect(executeMock).toHaveBeenCalledTimes(1);
    const call = executeMock.mock.calls[0]![0];
    const serialized = JSON.stringify(call);
    // SELECT 조건에 op 컬럼이 들어가면 안 된다.
    expect(serialized).not.toMatch(/\bop\s*=/i);
    expect(serialized).not.toMatch(/"op"/);
  });

  it("blocks when summed cost (wiki + non-wiki) exceeds limit", async () => {
    // 가정: ask 0.40 + wiki.ingest 0.35 + wiki.query 0.30 = 1.05 (합산된 총액만 반환)
    executeMock.mockResolvedValue({ rows: [{ total: "1.05" }] });
    const { assertBudget, BudgetExceededError } = await import("../budget.js");
    await expect(
      assertBudget("00000000-0000-0000-0000-0000000000aa"),
    ).rejects.toBeInstanceOf(BudgetExceededError);
  });
});

describe("recordBlocked forwards op when provided", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("passes op through to logLlmCall (wiki.* case)", async () => {
    const logLlmCallMock = vi.fn().mockResolvedValue(undefined);
    vi.doMock("../logger.js", () => ({
      logger: { info: vi.fn(), error: vi.fn() },
      withRequestId: () => ({ info: vi.fn() }),
      logLlmCall: logLlmCallMock,
    }));

    const { recordBlocked } = await import("../budget.js");
    await recordBlocked(
      "00000000-0000-0000-0000-0000000000aa",
      "gpt-5.4-mini",
      "req-wiki-blocked",
      "wiki.ingest.analysis",
    );
    expect(logLlmCallMock).toHaveBeenCalledTimes(1);
    const row = logLlmCallMock.mock.calls[0]![0];
    expect(row.op).toBe("wiki.ingest.analysis");
    expect(row.status).toBe("blocked_by_budget");
    expect(row.blockedBy).toBe("budget");
  });

  it("is back-compat when op is omitted (legacy ask/embed callers)", async () => {
    const logLlmCallMock = vi.fn().mockResolvedValue(undefined);
    vi.doMock("../logger.js", () => ({
      logger: { info: vi.fn(), error: vi.fn() },
      withRequestId: () => ({ info: vi.fn() }),
      logLlmCall: logLlmCallMock,
    }));

    const { recordBlocked } = await import("../budget.js");
    await recordBlocked(
      "00000000-0000-0000-0000-0000000000aa",
      "gpt-5.4-mini",
      "req-legacy-blocked",
    );
    expect(logLlmCallMock).toHaveBeenCalledTimes(1);
    const row = logLlmCallMock.mock.calls[0]![0];
    expect(row.op).toBeUndefined();
    expect(row.status).toBe("blocked_by_budget");
  });
});
