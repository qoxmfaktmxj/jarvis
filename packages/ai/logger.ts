import pino from "pino";
import { db } from "@jarvis/db/client";
import { llmCallLog, type NewLlmCallLog } from "@jarvis/db/schema";

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

export interface LlmCallLogRow {
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
}

export async function logLlmCall(row: LlmCallLogRow): Promise<void> {
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
      { err, requestId: row.requestId, model: row.model },
      "logLlmCall insert failed",
    );
    // 삼키기: 로깅 실패가 실제 LLM 호출 결과를 막지 않도록
  }

  logger.info(
    {
      requestId: row.requestId,
      workspaceId: row.workspaceId,
      model: row.model,
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      costUsd: row.costUsd,
      durationMs: row.durationMs,
      status: row.status,
    },
    "llm.call",
  );
}
