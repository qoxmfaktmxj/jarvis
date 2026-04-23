// packages/ai/agent/sse-adapter.ts
//
// Phase B3 — AskAgentEvent → SSEEvent (기존 Jarvis Ask AI 스트림) 변환.
//
// 목적: ask-agent 의 tool-use 이벤트 스트림을 기존 UI(useAskAI hook) 가
// 소비해온 SSEEvent 포맷으로 1:1 매핑. 파괴적 변경 없이 adapter 레이어만
// 추가한다. 실제 ask.ts 교체는 Phase E 후반에 Phase D lint gate 통과 후.
//
// 매핑:
//   text          → SSETextEvent        { type: 'text', content }
//   tool-call     → SSEMetaEvent        { type: 'meta', meta: { kind, name, input, callId } }
//   tool-result   → SSEMetaEvent        { type: 'meta', meta: { kind, name, callId, ok, error? } }
//   (누적)        → SSESourcesEvent     { type: 'sources', sources } ← done 직전 1회
//   done          → SSEMetaEvent(finishReason) + SSEDoneEvent
//
// 누적 소스 수집:
//   toolResults 맵에 각 callId 별 실제 ToolResult 를 주입하면, adapter 는
//   wiki_grep matches / wiki_read single page 를 WikiPageSourceRef 로 변환해
//   done 직전에 한 번에 sources 이벤트로 발행한다. toolResults 가 없으면
//   adapter 는 meta 이벤트만 발행 (sources 없음).

import type {
  SSEEvent,
  SSEMetaEvent,
  WikiPageSourceRef,
} from "../types.js";
import type { AskAgentEvent } from "./ask-agent.js";
import type { ToolResult } from "./tools/types.js";

export interface SSEAdapterOptions {
  /**
   * tool 실행 결과 맵. key = AskAgentEvent.tool-call 의 callId. value = 그
   * call 의 ToolResult. 주어지면 sources 를 집계해 done 직전에 한 번 발행.
   *
   * 주입 방식: ask-agent 를 wrap 하는 상위 계층(Phase E ask.ts)이 askAgent
   * 내부 loop 을 약간 수정해 Promise.all 결과를 이 맵에 채워 내려준다.
   * 현재는 선택적 — 이 파일은 순수 변환 책임만 진다.
   */
  toolResults?: Record<string, ToolResult<unknown>>;
}

interface WikiGrepMatchLike {
  slug: string;
  title: string;
  path: string;
  sensitivity: string;
}

interface WikiReadLike {
  slug: string;
  title: string;
  path: string;
  sensitivity: string;
}

function isWikiGrepData(
  data: unknown,
): data is { matches: WikiGrepMatchLike[] } {
  return (
    typeof data === "object" &&
    data !== null &&
    Array.isArray((data as { matches?: unknown }).matches)
  );
}

function isWikiReadData(data: unknown): data is WikiReadLike {
  return (
    typeof data === "object" &&
    data !== null &&
    typeof (data as { slug?: unknown }).slug === "string" &&
    typeof (data as { title?: unknown }).title === "string"
  );
}

function toWikiPageSourceRef(m: WikiGrepMatchLike | WikiReadLike): WikiPageSourceRef {
  return {
    kind: "wiki-page",
    pageId: m.slug,
    path: m.path,
    slug: m.slug,
    title: m.title,
    sensitivity: m.sensitivity,
    citation: `[[${m.slug}]]`,
    origin: "shortlist",
    confidence: 0.85,
  };
}

function collectWikiSources(
  toolName: string,
  result: ToolResult<unknown>,
  bag: Map<string, WikiPageSourceRef>,
): void {
  if (!result.ok) return;
  if (toolName === "wiki_grep" && isWikiGrepData(result.data)) {
    for (const m of result.data.matches) {
      if (!bag.has(m.slug)) bag.set(m.slug, toWikiPageSourceRef(m));
    }
  } else if (toolName === "wiki_read" && isWikiReadData(result.data)) {
    if (!bag.has(result.data.slug)) {
      bag.set(result.data.slug, toWikiPageSourceRef(result.data));
    }
  }
}

export async function* toSSE(
  src: AsyncGenerator<AskAgentEvent>,
  options: SSEAdapterOptions = {},
): AsyncGenerator<SSEEvent> {
  const sourceBag = new Map<string, WikiPageSourceRef>();

  for await (const ev of src) {
    switch (ev.type) {
      case "text":
        yield { type: "text", content: ev.text };
        break;

      case "tool-call": {
        const meta: SSEMetaEvent = {
          type: "meta",
          meta: {
            kind: "tool-call",
            name: ev.name,
            input: ev.input,
            callId: ev.callId,
          },
        };
        yield meta;
        break;
      }

      case "tool-result": {
        // 실제 ToolResult 가 주입됐으면 sources 누적
        const tr = options.toolResults?.[ev.callId];
        if (tr) collectWikiSources(ev.name, tr, sourceBag);

        const metaPayload: Record<string, unknown> = {
          kind: "tool-result",
          name: ev.name,
          callId: ev.callId,
          ok: ev.ok,
        };
        if (ev.error !== undefined) metaPayload["error"] = ev.error;
        yield { type: "meta", meta: metaPayload };
        break;
      }

      case "done": {
        if (sourceBag.size > 0) {
          yield {
            type: "sources",
            sources: Array.from(sourceBag.values()),
          };
        }
        yield {
          type: "meta",
          meta: { kind: "done", finishReason: ev.finishReason, steps: ev.steps },
        };
        yield { type: "done", totalTokens: 0 };
        break;
      }
    }
  }
}
