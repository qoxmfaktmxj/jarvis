// packages/ai/agent/tools/sensitivity-filter.ts
//
// Ask AI tool-use agent의 공통 방어선 (workspace + RBAC).
//
// 각 tool(wiki-grep/wiki-read/wiki-follow-link/wiki-graph-query)은 자체 SQL
// 필터로 workspaceId 를 이미 걸지만, 여기서는 **belt-and-suspenders** 역할:
//
//   1. session context가 온전한지 선제 확인 (workspaceId, userId, permissions)
//   2. inner tool 이 throw 하면 err(unknown) 으로 변환 — agent loop 이 죽지 않게
//
// 행 단위 sensitivity 필터링은 **D4=A 결정으로 제거**되었다 (2026-05-11). 모든
// KNOWLEDGE_READ 보유자는 자기 workspace 의 모든 위키 데이터를 LLM 도구로
// 조회 가능하다 — RBAC 게이트 + workspaceId 격리만으로 충분.
//
// NOTE: 파일명은 sensitivity-filter.ts 그대로 유지한다 (Step 3 cleanup 에서
// 일괄 정리). 함수는 `withWorkspaceRbacFilter` 로 리네이밍됨.
//
// 향후: 호출 로깅 / audit emit / tool call 쿼터를 이 레이어에 추가한다.

import { err, type ToolContext, type ToolDefinition, type ToolResult } from "./types.js";

function hasValidContext(ctx: ToolContext): boolean {
  if (!ctx) return false;
  if (!ctx.workspaceId || ctx.workspaceId.trim().length === 0) return false;
  if (!ctx.userId || ctx.userId.trim().length === 0) return false;
  if (!Array.isArray(ctx.permissions)) return false;
  return true;
}

/**
 * Wrap a tool with workspace + RBAC context validation and uniform error
 * conversion. Replaces the prior `withSensitivityFilter` (renamed 2026-05-11
 * after D4=A removed row-level sensitivity gating from Ask AI).
 *
 * - Validates ctx.workspaceId / ctx.userId / ctx.permissions before dispatch.
 * - Catches inner throws and returns `err("unknown", message)` so the agent
 *   loop can continue and surface the error to the LLM as a tool message.
 */
export function withWorkspaceRbacFilter<Input, Output>(
  tool: ToolDefinition<Input, Output>,
): ToolDefinition<Input, Output> {
  return {
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    async execute(input: Input, ctx: ToolContext): Promise<ToolResult<Output>> {
      if (!hasValidContext(ctx)) {
        return err("forbidden", "invalid session context");
      }
      try {
        return await tool.execute(input, ctx);
      } catch (e) {
        return err("unknown", e instanceof Error ? e.message : String(e));
      }
    },
  };
}
