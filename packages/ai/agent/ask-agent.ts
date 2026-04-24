// packages/ai/agent/ask-agent.ts
//
// Phase B1 — Ask AI tool-use agent loop.
//
// LLM 이 wiki_grep / wiki_read / wiki_follow_link / wiki_graph_query 를
// 필요한 만큼 호출해가며 위키를 탐색하고 최종 답변을 합성한다.
// embedding RAG 없이 Karpathy LLM Wiki 패턴으로 동작.
//
// 이 단계에서는 non-streaming 만 구현. Phase B2 에서 SSE / tool progress
// 이벤트를 추가한다.

import type OpenAI from "openai";
import { withSensitivityFilter } from "./tools/sensitivity-filter.js";
import type { ToolContext, ToolDefinition, ToolResult } from "./tools/types.js";
import { wikiGrep } from "./tools/wiki-grep.js";
import { wikiRead } from "./tools/wiki-read.js";
import { wikiFollowLink } from "./tools/wiki-follow-link.js";
import { wikiGraphQuery } from "./tools/wiki-graph-query.js";

export const MAX_TOOL_STEPS = 8;

export const ASK_SYSTEM_PROMPT = `당신은 Jarvis 사내 위키를 탐색해 답하는 어시스턴트입니다.

- 먼저 wiki_grep 으로 관련 페이지 3~5개를 찾고, wiki_read 로 본문을 읽어 답하세요.
- 연결된 개념이 있으면 wiki_follow_link 또는 wiki_graph_query 로 확장합니다.
- 답변에는 반드시 \`[[slug]]\` 형식의 citation 을 포함하세요.
- 근거가 없으면 추측하지 말고 "문서에 없습니다"라고 답하세요.
- 최대 ${MAX_TOOL_STEPS}회까지 도구를 호출할 수 있습니다.
- 검색 범위는 세션의 workspace 와 권한 안으로 자동 제한됩니다.`;

export interface AskAgentOptions {
  model?: string;
  client: Pick<OpenAI, "chat">;
  systemPrompt?: string;
}

export interface AskAgentToolCall {
  name: string;
  input: unknown;
  ok: boolean;
}

export interface AskAgentResult {
  answer: string;
  toolCalls: AskAgentToolCall[];
  steps: number;
  finishReason: "stop" | "max_steps" | "error";
}

// ---------------------------------------------------------------------------
// Phase B2 — Streaming event types.
//
// askAgentStream 은 각 step 경계에서 tool-call / tool-result 이벤트를 yield
// 하고 최종 content 를 text 이벤트로 발행한다. OpenAI token-level streaming
// 은 Phase B3 (ask.ts 교체) 에서 서비스 SSE 와 합칠 때 선택 도입한다.
// ---------------------------------------------------------------------------

export type AskAgentEvent =
  | { type: "tool-call"; name: string; input: unknown; callId: string }
  | { type: "tool-result"; name: string; callId: string; ok: boolean; error?: string }
  | { type: "text"; text: string }
  | {
      type: "done";
      finishReason: "stop" | "max_steps" | "error";
      steps: number;
      /** Accumulated OpenAI usage.total_tokens across all steps (Phase B3). */
      totalTokens: number;
    };

// ---------------------------------------------------------------------------
// Tool registry — Phase A 에서 만든 tool 들을 sensitivity wrapper 로 감싸
// 한 곳에서 이름→ToolDefinition 매핑.
// ---------------------------------------------------------------------------

function buildToolDict(): Record<string, ToolDefinition<unknown, unknown>> {
  const list = [wikiGrep, wikiRead, wikiFollowLink, wikiGraphQuery] as const;
  const out: Record<string, ToolDefinition<unknown, unknown>> = {};
  for (const t of list) {
    const wrapped = withSensitivityFilter(
      t as unknown as ToolDefinition<unknown, unknown>,
    );
    out[wrapped.name] = wrapped;
  }
  return out;
}

function toOpenAITools(
  dict: Record<string, ToolDefinition<unknown, unknown>>,
): Array<{
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}> {
  return Object.values(dict).map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

function parseJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

type ChatCreateParams = Parameters<OpenAI["chat"]["completions"]["create"]>[0];
type ChatMessage = ChatCreateParams extends { messages: infer M } ? (M extends ReadonlyArray<infer E> ? E : never) : never;

export async function askAgent(
  question: string,
  ctx: ToolContext,
  options: AskAgentOptions,
): Promise<AskAgentResult> {
  const model = options.model ?? "gpt-5.4-mini";
  const systemPrompt = options.systemPrompt ?? ASK_SYSTEM_PROMPT;
  const tools = buildToolDict();
  const openaiTools = toOpenAITools(tools);

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt } as ChatMessage,
    { role: "user", content: question } as ChatMessage,
  ];

  const toolCalls: AskAgentToolCall[] = [];

  for (let step = 0; step < MAX_TOOL_STEPS; step++) {
    const res = await options.client.chat.completions.create({
      model,
      messages,
      tools: openaiTools,
    } as ChatCreateParams) as Awaited<ReturnType<OpenAI["chat"]["completions"]["create"]>>;

    const choice = (res as { choices?: Array<{ message?: unknown }> }).choices?.[0];
    const msg = choice?.message as
      | {
          role: "assistant";
          content: string | null;
          tool_calls?: Array<{
            id: string;
            type: "function";
            function: { name: string; arguments: string };
          }>;
        }
      | undefined;

    if (!msg) {
      return { answer: "", toolCalls, steps: step + 1, finishReason: "error" };
    }

    // 종료 조건: LLM 이 tool 없이 content 만 반환
    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      return {
        answer: msg.content ?? "",
        toolCalls,
        steps: step + 1,
        finishReason: "stop",
      };
    }

    // Assistant 메시지(= tool_calls 포함) 를 conversation 에 그대로 push
    messages.push(msg as unknown as ChatMessage);

    // 각 tool_call 을 병렬로 실행
    const results = await Promise.all(
      msg.tool_calls.map(async (tc) => {
        const input = parseJson(tc.function.arguments);
        const tool = tools[tc.function.name];
        let result: ToolResult<unknown>;
        if (!tool) {
          result = { ok: false, code: "unknown", error: `unknown tool: ${tc.function.name}` };
        } else {
          result = await tool.execute(input, ctx);
        }
        return { tc, input, result };
      }),
    );

    for (const { tc, input, result } of results) {
      toolCalls.push({ name: tc.function.name, input, ok: result.ok });
      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: JSON.stringify(result),
      } as unknown as ChatMessage);
    }
  }

  return { answer: "", toolCalls, steps: MAX_TOOL_STEPS, finishReason: "max_steps" };
}

// ---------------------------------------------------------------------------
// askAgentStream — Same loop, AsyncGenerator<AskAgentEvent>.
//
// 본 함수는 **step-boundary streaming** 이다. 즉 LLM 토큰은 여전히 step
// 단위로 한 번에 받지만(`stream: false`), 각 step 사이에 tool-call /
// tool-result 이벤트를 yield 하여 UI 가 "위키 검색 중" 같은 진행 상태를
// 즉시 표시할 수 있게 한다. token-level streaming 은 Phase B3 의 ask.ts
// 통합 단계에서 선택 도입.
// ---------------------------------------------------------------------------

export async function* askAgentStream(
  question: string,
  ctx: ToolContext,
  options: AskAgentOptions,
): AsyncGenerator<AskAgentEvent> {
  const model = options.model ?? "gpt-5.4-mini";
  const systemPrompt = options.systemPrompt ?? ASK_SYSTEM_PROMPT;
  const tools = buildToolDict();
  const openaiTools = toOpenAITools(tools);

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt } as ChatMessage,
    { role: "user", content: question } as ChatMessage,
  ];

  // Phase B3: accumulate total_tokens across all steps.
  let totalTokens = 0;

  for (let step = 0; step < MAX_TOOL_STEPS; step++) {
    const res = (await options.client.chat.completions.create({
      model,
      messages,
      tools: openaiTools,
    } as ChatCreateParams)) as Awaited<ReturnType<OpenAI["chat"]["completions"]["create"]>>;

    // Accumulate usage tokens from each step response.
    const usage = (res as { usage?: { total_tokens?: number } }).usage;
    if (usage?.total_tokens) {
      totalTokens += usage.total_tokens;
    }

    const choice = (res as { choices?: Array<{ message?: unknown }> }).choices?.[0];
    const msg = choice?.message as
      | {
          role: "assistant";
          content: string | null;
          tool_calls?: Array<{
            id: string;
            type: "function";
            function: { name: string; arguments: string };
          }>;
        }
      | undefined;

    if (!msg) {
      yield { type: "done", finishReason: "error", steps: step + 1, totalTokens };
      return;
    }

    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      if (msg.content && msg.content.length > 0) {
        yield { type: "text", text: msg.content };
      }
      yield { type: "done", finishReason: "stop", steps: step + 1, totalTokens };
      return;
    }

    // 1) tool-call 이벤트를 먼저 모두 yield (UI 즉시 반영)
    const parsed = msg.tool_calls.map((tc) => ({
      tc,
      input: parseJson(tc.function.arguments),
    }));
    for (const { tc, input } of parsed) {
      yield { type: "tool-call", name: tc.function.name, input, callId: tc.id };
    }

    // 2) assistant 메시지 conversation 에 추가
    messages.push(msg as unknown as ChatMessage);

    // 3) 병렬 실행
    const results = await Promise.all(
      parsed.map(async ({ tc, input }) => {
        const tool = tools[tc.function.name];
        const result: ToolResult<unknown> = tool
          ? await tool.execute(input, ctx)
          : { ok: false, code: "unknown", error: `unknown tool: ${tc.function.name}` };
        return { tc, result };
      }),
    );

    // 4) tool-result 이벤트 yield + messages 에 tool 메시지 push
    for (const { tc, result } of results) {
      const errorMsg = !result.ok ? result.error : undefined;
      yield {
        type: "tool-result",
        name: tc.function.name,
        callId: tc.id,
        ok: result.ok,
        ...(errorMsg !== undefined ? { error: errorMsg } : {}),
      };
      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: JSON.stringify(result),
      } as unknown as ChatMessage);
    }
  }

  yield { type: "done", finishReason: "max_steps", steps: MAX_TOOL_STEPS, totalTokens };
}
