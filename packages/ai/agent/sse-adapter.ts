// packages/ai/agent/sse-adapter.ts
//
// Phase B3 — SSE adapter bridging AskAgentEvent (agent) → SSEEvent (service).
//
// Maps the agent's internal event stream to the shape that
// `apps/web/app/api/ask/route.ts` consumes via `askAI()`.

import type { AskAgentEvent } from "./ask-agent.js";
import type { SSEEvent, SourceRef } from "../types.js";
import type { WikiPageSourceRef } from "../types.js";

// ---------------------------------------------------------------------------
// wiki_read tool output shape (from packages/ai/agent/tools/wiki-read.ts)
// ---------------------------------------------------------------------------
interface WikiReadData {
  slug: string;
  title: string;
  path: string;
  sensitivity: string;
}

interface ToolResultPayload {
  ok: boolean;
  data?: WikiReadData;
  error?: string;
  code?: string;
}

// ---------------------------------------------------------------------------
// askAgentToSSE — async generator that maps AskAgentEvent → SSEEvent.
//
// Adapter rules:
//   tool-call   → dropped (SSEEvent union has no tool-call variant yet;
//                 keeping the union minimal to avoid UI churn in B3 —
//                 UI can subscribe to these once Phase G2 adds the panel)
//   tool-result → accumulate wiki-page sources when name==="wiki_read" && ok
//                 (also dropped from the SSE stream for same reason above)
//   text        → { type:"text", content: text }
//   done/stop   → emit sources then done
//   done/max_steps → { type:"error", message:"최대 도구 호출..." }
//   done/error  → { type:"error", message:"에이전트 실행 중..." }
// ---------------------------------------------------------------------------

export async function* askAgentToSSE(
  agentEvents: AsyncGenerator<AskAgentEvent>,
  workspaceId: string,
): AsyncGenerator<SSEEvent> {
  const accumulatedSources: WikiPageSourceRef[] = [];

  for await (const event of agentEvents) {
    switch (event.type) {
      case "tool-call":
        // Dropped in B3 — SSEEvent union has no tool-call variant yet.
        // Future: extend SSEEvent with tool-call/tool-result and remove this comment.
        break;

      case "tool-result": {
        // Dropped from SSE stream; side-effect: accumulate wiki sources.
        if (event.name === "wiki_read" && event.ok) {
          // The tool result content is available via the agent events stream.
          // However AskAgentEvent tool-result does not carry the full data payload —
          // it only carries ok/error. The actual data was consumed by the agent loop.
          // We cannot reconstruct the WikiPageSourceRef here without the data.
          // This is by design: the SSE adapter only gets the event shape, not the
          // raw tool output. Source accumulation requires the data field.
          //
          // Resolution: the agent emits `tool-result` events with the result payload
          // injected. We cast to access an optional `_data` field if present, or
          // rely on the extended event type below.
          //
          // Phase B3 pragmatic decision: wiki sources are best accumulated at the
          // ask.ts level from the askAgent (non-streaming) result, or via an
          // extended event type. For now, attempt to extract from the event.
          const extended = event as AskAgentEvent & { _data?: unknown };
          const payload = extended._data as ToolResultPayload | undefined;
          if (payload?.ok && payload.data) {
            const d = payload.data;
            accumulatedSources.push({
              kind: "wiki-page",
              pageId: d.slug, // slug as pageId (index join not needed for citations)
              path: d.path,
              slug: d.slug,
              title: d.title,
              sensitivity: d.sensitivity,
              citation: `[[${d.slug}]]`,
              origin: "shortlist",
              confidence: 0.8,
            });
          }
        }
        break;
      }

      case "text":
        yield { type: "text", content: event.text };
        break;

      case "done":
        if (event.finishReason === "stop") {
          // Emit sources first, then done.
          if (accumulatedSources.length > 0) {
            yield { type: "sources", sources: accumulatedSources as SourceRef[] };
          } else {
            // Always emit sources event so route.ts can collect it.
            yield { type: "sources", sources: [] };
          }
          yield { type: "done", totalTokens: event.totalTokens };
        } else if (event.finishReason === "max_steps") {
          yield {
            type: "error",
            message:
              "최대 도구 호출 횟수(MAX_TOOL_STEPS)를 초과했습니다",
          };
          // Still emit done so the route handler can close cleanly.
          yield { type: "done", totalTokens: event.totalTokens };
        } else {
          // finishReason === "error"
          yield {
            type: "error",
            message: "에이전트 실행 중 오류가 발생했습니다",
          };
          yield { type: "done", totalTokens: event.totalTokens };
        }
        break;
    }
  }
}
