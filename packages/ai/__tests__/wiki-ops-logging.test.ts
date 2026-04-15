// packages/ai/__tests__/wiki-ops-logging.test.ts
// Phase-W1 T5 (Track B2): wiki.* op 6종 로깅 스모크 테스트.
//
// 목적:
//   - `logLlmCall({ op: "wiki.*" })` 호출 시 DB insert가 시도되는지 검증.
//   - 잘못된 op 문자열이 들어오면 Sentry captureException으로 보고되는지 검증.
//   - op 전달이 없어도 기존 호출 경로(ask/embed 레거시)가 깨지지 않는지 확인.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { WIKI_OPS } from "@jarvis/shared/constants";

const insertValuesMock = vi.fn().mockResolvedValue(undefined);
const captureExceptionMock = vi.fn();

vi.mock("@jarvis/db/client", () => ({
  db: {
    insert: vi.fn().mockReturnValue({ values: insertValuesMock }),
  },
}));

vi.mock("@jarvis/shared/sentry", () => ({
  captureException: captureExceptionMock,
  captureMessage: vi.fn(),
  initSentry: vi.fn(),
}));

describe("logLlmCall wiki op typing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(WIKI_OPS)(
    "records llm_call_log row for wiki op %s",
    async (op) => {
      const { logLlmCall } = await import("../logger.js");
      await logLlmCall({
        op,
        workspaceId: "00000000-0000-0000-0000-0000000000aa",
        requestId: `req-${op}`,
        model: "gpt-5.4-mini",
        promptVersion: "2026-04-v1",
        inputTokens: 100,
        outputTokens: 200,
        costUsd: "0.0025",
        durationMs: 450,
        status: "ok",
        blockedBy: null,
        errorCode: null,
        sensitivityScope:
          "workspace:00000000-0000-0000-0000-0000000000aa|level:internal|graph:0",
        pagePath: "auto/entities/MindVault.md",
      });
      expect(insertValuesMock).toHaveBeenCalledTimes(1);
      const row = insertValuesMock.mock.calls[0]![0];
      // op/sensitivityScope/pagePath는 B1 DB 컬럼 생기기 전까지 INSERT row에 빠져있다.
      expect(row.workspaceId).toBe("00000000-0000-0000-0000-0000000000aa");
      expect(row.requestId).toBe(`req-${op}`);
      expect(row.status).toBe("ok");
      expect(row.promptVersion).toBe("2026-04-v1");
      // Sentry로 unknown op 경보가 가지 않아야 한다 (이들은 전부 유효한 op).
      expect(captureExceptionMock).not.toHaveBeenCalled();
    },
  );

  it("accepts legacy call without op field (back-compat)", async () => {
    const { logLlmCall } = await import("../logger.js");
    await logLlmCall({
      workspaceId: "00000000-0000-0000-0000-000000000001",
      requestId: "req-legacy",
      model: "gpt-5.4-mini",
      promptVersion: null,
      inputTokens: 5,
      outputTokens: 10,
      costUsd: "0.0001",
      durationMs: 50,
      status: "ok",
      blockedBy: null,
      errorCode: null,
    });
    expect(insertValuesMock).toHaveBeenCalledTimes(1);
    expect(captureExceptionMock).not.toHaveBeenCalled();
  });

  it("reports unknown op string to Sentry but still attempts insert", async () => {
    const { logLlmCall } = await import("../logger.js");
    await logLlmCall({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      op: "wiki.unknown.op" as any,
      workspaceId: "00000000-0000-0000-0000-000000000001",
      requestId: "req-bad-op",
      model: "gpt-5.4-mini",
      promptVersion: null,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: "0",
      durationMs: 10,
      status: "error",
      blockedBy: null,
      errorCode: "invalid",
    });
    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
    // INSERT는 여전히 시도된다 (관측이 LLM 호출을 막으면 안 됨).
    expect(insertValuesMock).toHaveBeenCalledTimes(1);
  });

  it("does not throw when db insert fails (best-effort observability)", async () => {
    insertValuesMock.mockRejectedValueOnce(new Error("db down"));
    const { logLlmCall } = await import("../logger.js");
    await expect(
      logLlmCall({
        op: "wiki.ingest.analysis",
        workspaceId: "00000000-0000-0000-0000-000000000001",
        requestId: "req-db-down",
        model: "gpt-5.4-mini",
        promptVersion: null,
        inputTokens: 1,
        outputTokens: 1,
        costUsd: "0",
        durationMs: 1,
        status: "ok",
        blockedBy: null,
        errorCode: null,
      }),
    ).resolves.toBeUndefined();
    expect(captureExceptionMock).toHaveBeenCalled();
  });
});
