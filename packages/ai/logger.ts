import pino from "pino";
import { db } from "@jarvis/db/client";
import { llmCallLog, type NewLlmCallLog } from "@jarvis/db/schema";
import { isValidOp, isWikiOp, type OpType } from "@jarvis/shared/constants";
import { captureException } from "@jarvis/shared/sentry";

export const logger = pino({
  level: process.env["LOG_LEVEL"] ?? "info",
  base: { service: "jarvis-ai" },
  redact: {
    paths: ["req.headers.authorization", "req.headers.cookie", "*.apiKey"],
    remove: true,
  },
});

export function withRequestId(requestId: string) {
  return logger.child({ requestId });
}

/**
 * llm_call_log row payload.
 *
 * 필드 분류:
 * - 기존(Phase-7A): workspaceId, requestId, model, promptVersion, tokens, cost,
 *   duration, status, blockedBy, errorCode.
 * - Phase-W1 T5 추가(op/wiki 메타): op, sensitivityScope, pagePath.
 *
 * `op`, `sensitivityScope`, `pagePath`는 DB 컬럼이 아직 없다 (Track B1에서 추가 예정).
 * 따라서 현재는 pino structured log에만 기록되고 DB INSERT에서는 제외된다.
 * B1에서 컬럼이 추가되면 `insertRow` 매핑에 필드를 추가하기만 하면 된다.
 */
export interface LlmCallLogRow {
  /** LLM 호출 op 타입. 예: "ask", "embed", "wiki.ingest.analysis". */
  op?: OpType;
  workspaceId: string;
  requestId: string | null;
  model: string;
  promptVersion: string | null;
  inputTokens: number;
  outputTokens: number;
  costUsd: string; // numeric as string
  durationMs: number;
  status: "ok" | "error" | "blocked_by_budget";
  blockedBy: string | null;
  errorCode: string | null;
  /** wiki.* op에서 RBAC/sensitivity 관측용. 예: "level:internal|graph:0". */
  sensitivityScope?: string | null;
  /** wiki 페이지 경로(있으면). 예: "auto/entities/MindVault.md". */
  pagePath?: string | null;
}

export async function logLlmCall(row: LlmCallLogRow): Promise<void> {
  // Validate op if provided. 잘못된 op 문자열은 Sentry로 보고하지만 로깅 자체는
  // 최선 노력으로 계속 진행한다 (관측이 LLM 호출 결과를 막으면 안 됨).
  if (row.op !== undefined && !isValidOp(row.op)) {
    captureException(new Error(`logLlmCall: unknown op type "${row.op}"`), {
      op: row.op,
      workspaceId: row.workspaceId,
      requestId: row.requestId,
    });
  }

  // NOTE (Track B1 의존):
  //   `op`, `sensitivity_scope`, `page_path` DB 컬럼이 추가되면 아래 insertRow에
  //   대응 필드를 포함시키면 된다. 현재는 컬럼이 없어서 INSERT에서 제외.
  const insertRow: NewLlmCallLog = {
    workspaceId: row.workspaceId,
    requestId: row.requestId ?? undefined,
    model: row.model,
    promptVersion: row.promptVersion ?? undefined,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    costUsd: row.costUsd,
    durationMs: row.durationMs,
    status: row.status,
    blockedBy: row.blockedBy ?? undefined,
    errorCode: row.errorCode ?? undefined,
  };

  try {
    await db.insert(llmCallLog).values(insertRow);
  } catch (err) {
    logger.error(
      { err, requestId: row.requestId, model: row.model, op: row.op },
      "logLlmCall insert failed",
    );
    captureException(err, {
      where: "logLlmCall.insert",
      workspaceId: row.workspaceId,
      requestId: row.requestId,
      op: row.op,
    });
    // 삼키기: 로깅 실패가 실제 LLM 호출 결과를 막지 않도록
  }

  logger.info(
    {
      op: row.op,
      isWikiOp: row.op ? isWikiOp(row.op) : false,
      requestId: row.requestId,
      workspaceId: row.workspaceId,
      model: row.model,
      promptVersion: row.promptVersion,
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      costUsd: row.costUsd,
      durationMs: row.durationMs,
      status: row.status,
      sensitivityScope: row.sensitivityScope ?? null,
      pagePath: row.pagePath ?? null,
    },
    "llm.call",
  );
}
