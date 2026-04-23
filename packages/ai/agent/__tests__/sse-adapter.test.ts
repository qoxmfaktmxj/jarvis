// packages/ai/agent/__tests__/sse-adapter.test.ts
//
// Phase B3 — askAgentStream 의 AskAgentEvent 를 기존 SSEEvent 로 변환하는
// adapter 의 단위 테스트.
//
// 동작 목표:
// 1. text / done 이벤트 → 기존 SSE 이벤트로 1:1 매핑
// 2. tool-call / tool-result → SSEMetaEvent (UI 진행 상태 side-channel)
// 3. wiki_grep / wiki_read 의 tool-result 에서 slug 를 수집해 최종적으로
//    SSESourcesEvent 를 발행 (누적 후 done 직전에 한 번)
// 4. adapter 가 AsyncGenerator 를 drain 해도 원본 event 순서 보존

import { describe, it, expect } from "vitest";
import { toSSE } from "../sse-adapter.js";
import type { AskAgentEvent } from "../ask-agent.js";
import type { SSEEvent, WikiPageSourceRef } from "../../types.js";

async function* fromArray<T>(items: T[]): AsyncGenerator<T> {
  for (const item of items) yield item;
}

async function collect(gen: AsyncGenerator<SSEEvent>): Promise<SSEEvent[]> {
  const out: SSEEvent[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

const baseMatch = {
  path: "wiki/jarvis/manual/x.md",
  sensitivity: "INTERNAL",
  snippet: "",
};

describe("toSSE adapter", () => {
  it("passes text → SSETextEvent with content field", async () => {
    const src: AskAgentEvent[] = [
      { type: "text", text: "바로 답변" },
      { type: "done", finishReason: "stop", steps: 1 },
    ];
    const events = await collect(toSSE(fromArray(src)));
    expect(events[0]).toEqual({ type: "text", content: "바로 답변" });
  });

  it("emits done at the end with totalTokens=0 placeholder", async () => {
    const src: AskAgentEvent[] = [{ type: "done", finishReason: "stop", steps: 1 }];
    const events = await collect(toSSE(fromArray(src)));
    const done = events[events.length - 1];
    expect(done?.type).toBe("done");
    if (done?.type === "done") expect(done.totalTokens).toBe(0);
  });

  it("converts tool-call into SSEMetaEvent with meta.kind='tool-call'", async () => {
    const src: AskAgentEvent[] = [
      { type: "tool-call", name: "wiki_grep", input: { query: "x" }, callId: "c1" },
      { type: "done", finishReason: "stop", steps: 1 },
    ];
    const events = await collect(toSSE(fromArray(src)));
    const meta = events.find((e) => e.type === "meta");
    expect(meta).toBeDefined();
    if (meta?.type === "meta") {
      expect(meta.meta).toMatchObject({ kind: "tool-call", name: "wiki_grep" });
    }
  });

  it("converts tool-result into SSEMetaEvent with kind='tool-result'", async () => {
    const src: AskAgentEvent[] = [
      { type: "tool-result", name: "wiki_grep", callId: "c1", ok: true },
      { type: "done", finishReason: "stop", steps: 1 },
    ];
    const events = await collect(toSSE(fromArray(src)));
    const meta = events.find((e) => e.type === "meta");
    expect(meta).toBeDefined();
    if (meta?.type === "meta") {
      expect(meta.meta).toMatchObject({ kind: "tool-result", name: "wiki_grep", ok: true });
    }
  });

  it("accumulates wiki_grep matches as WikiPageSourceRef[] and emits sources before done", async () => {
    const matches = [
      { slug: "a", title: "A", ...baseMatch },
      { slug: "b", title: "B", ...baseMatch },
    ];
    const src: AskAgentEvent[] = [
      { type: "tool-call", name: "wiki_grep", input: { query: "a" }, callId: "c1" },
      { type: "tool-result", name: "wiki_grep", callId: "c1", ok: true },
      { type: "text", text: "답" },
      { type: "done", finishReason: "stop", steps: 2 },
    ];
    const events = await collect(
      toSSE(fromArray(src), {
        toolResults: { c1: { ok: true, data: { matches } } },
      }),
    );
    const sources = events.find((e) => e.type === "sources");
    expect(sources).toBeDefined();
    if (sources?.type === "sources") {
      const wikiRefs = sources.sources.filter(
        (s): s is WikiPageSourceRef => s.kind === "wiki-page",
      );
      expect(wikiRefs.map((r) => r.slug)).toEqual(["a", "b"]);
      expect(wikiRefs[0]?.citation).toBe("[[a]]");
    }
    // sources 는 done 앞에 와야 한다
    const sourceIdx = events.findIndex((e) => e.type === "sources");
    const doneIdx = events.findIndex((e) => e.type === "done");
    expect(sourceIdx).toBeGreaterThanOrEqual(0);
    expect(sourceIdx).toBeLessThan(doneIdx);
  });

  it("does not emit sources event when no wiki-page slug was observed", async () => {
    const src: AskAgentEvent[] = [
      { type: "text", text: "문서에 없습니다." },
      { type: "done", finishReason: "stop", steps: 1 },
    ];
    const events = await collect(toSSE(fromArray(src)));
    expect(events.find((e) => e.type === "sources")).toBeUndefined();
  });

  it("surfaces error tool result into meta event (ok=false + error msg)", async () => {
    const src: AskAgentEvent[] = [
      { type: "tool-result", name: "wiki_grep", callId: "c1", ok: false, error: "too short" },
      { type: "done", finishReason: "stop", steps: 1 },
    ];
    const events = await collect(toSSE(fromArray(src)));
    const meta = events.find((e) => e.type === "meta" && (e.meta as Record<string, unknown>).kind === "tool-result");
    expect(meta).toBeDefined();
    if (meta?.type === "meta") {
      expect(meta.meta).toMatchObject({ ok: false, error: "too short" });
    }
  });

  it("maps done{max_steps} into SSEDoneEvent and appends a meta{finishReason}", async () => {
    const src: AskAgentEvent[] = [
      { type: "done", finishReason: "max_steps", steps: 8 },
    ];
    const events = await collect(toSSE(fromArray(src)));
    const done = events.find((e) => e.type === "done");
    expect(done).toBeDefined();
    const meta = events.find(
      (e) => e.type === "meta" && (e.meta as Record<string, unknown>).finishReason === "max_steps",
    );
    expect(meta).toBeDefined();
  });
});
