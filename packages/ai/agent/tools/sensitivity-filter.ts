// packages/ai/agent/tools/sensitivity-filter.ts
//
// Ask AI tool-use agent의 공통 방어선.
// 각 tool(wiki-grep/wiki-read/wiki-follow-link/wiki-graph-query)은 자체 SQL
// 필터로 sensitivity 를 이미 걸지만, 여기서는 **belt-and-suspenders** 역할:
//
//   1. session context가 온전한지 선제 확인 (workspaceId, userId, permissions)
//   2. inner tool 이 throw 하면 err(unknown) 으로 변환 — agent loop 이 죽지 않게
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

export function withSensitivityFilter<Input, Output>(
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
