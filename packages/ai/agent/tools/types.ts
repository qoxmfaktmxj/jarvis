// packages/ai/agent/tools/types.ts
//
// Ask AI tool-use agent의 공통 타입.
// Karpathy LLM Wiki 스타일 Harness 에서 LLM 이 호출할 도구의 계약을 정의한다.

export interface ToolContext {
  /** 세션의 workspace — 모든 tool 이 이 workspace 로만 scope. */
  workspaceId: string;
  /** 세션의 user — audit/logging 용. */
  userId: string;
  /** session.permissions — sensitivity 필터 판정에 사용. */
  permissions: readonly string[];
  /** 현재 Ask 대화 id (로그·디버깅 용, 없으면 새 대화). */
  conversationId?: string;
}

export type ToolErrorCode =
  | "not_found"
  | "forbidden"
  | "invalid"
  | "timeout"
  | "unknown";

export type ToolResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: ToolErrorCode };

export interface ToolDefinition<Input, Output> {
  /** 고정 이름 (스네이크 케이스). AI SDK tool 이름으로도 쓰임. */
  name: string;
  /** LLM 이 보는 한국어/영어 설명. */
  description: string;
  /** JSON Schema (AI SDK / OpenAI function-calling 호환). */
  parameters: Record<string, unknown>;
  execute(input: Input, ctx: ToolContext): Promise<ToolResult<Output>>;
}

/** 성공 result 생성자. */
export function ok<T>(data: T): ToolResult<T> {
  return { ok: true, data };
}

/** 실패 result 생성자. */
export function err<T = never>(
  code: ToolErrorCode,
  error: string,
): ToolResult<T> {
  return { ok: false, code, error };
}
