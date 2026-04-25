// packages/ai/agent/__tests__/sse-adapter.test.ts
//
// Phase B3 — unit tests for askAgentToSSE adapter.
// Validates all event mapping rules end-to-end.

import { describe, expect, it } from "vitest";
import { askAgentToSSE } from "../sse-adapter.js";
import type { AskAgentEvent } from "../ask-agent.js";
import type { SSEEvent } from "../../types.js";

// ---------------------------------------------------------------------------
// Helper: create an async generator from an array of events.
// ---------------------------------------------------------------------------
async function* fromEvents(events: AskAgentEvent[]): AsyncGenerator<AskAgentEvent> {
  for (const e of events) yield e;
}

async function collect(gen: AsyncGenerator<SSEEvent>): Promise<SSEEvent[]> {
  const out: SSEEvent[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

const WS = "ws-test";

// ---------------------------------------------------------------------------
// text → SSETextEvent
// ---------------------------------------------------------------------------
describe("askAgentToSSE — text mapping", () => {
  it("maps text event to SSETextEvent with content field", async () => {
    const events = await collect(
      askAgentToSSE(
        fromEvents([
          { type: "text", text: "안녕하세요" },
          { type: "done", finishReason: "stop", steps: 1, totalTokens: 50 },
        ]),
        WS,
      ),
    );
    const textEvent = events.find((e) => e.type === "text");
    expect(textEvent).toMatchObject({ type: "text", content: "안녕하세요" });
  });
});

// ---------------------------------------------------------------------------
// done/stop → sources + done
// ---------------------------------------------------------------------------
describe("askAgentToSSE — done/stop mapping", () => {
  it("emits sources then done when finishReason=stop", async () => {
    const events = await collect(
      askAgentToSSE(
        fromEvents([
          { type: "text", text: "답변" },
          { type: "done", finishReason: "stop", steps: 1, totalTokens: 100 },
        ]),
        WS,
      ),
    );
    const types = events.map((e) => e.type);
    // sources must come before done
    const sourcesIdx = types.indexOf("sources");
    const doneIdx = types.indexOf("done");
    expect(sourcesIdx).toBeGreaterThanOrEqual(0);
    expect(doneIdx).toBeGreaterThan(sourcesIdx);
  });

  it("done event carries totalTokens from agent done event", async () => {
    const events = await collect(
      askAgentToSSE(
        fromEvents([
          { type: "done", finishReason: "stop", steps: 1, totalTokens: 42 },
        ]),
        WS,
      ),
    );
    const doneEvent = events.find((e) => e.type === "done");
    expect(doneEvent).toMatchObject({ type: "done", totalTokens: 42 });
  });

  it("emits empty sources array when no wiki_read results accumulated", async () => {
    const events = await collect(
      askAgentToSSE(
        fromEvents([
          { type: "done", finishReason: "stop", steps: 1, totalTokens: 10 },
        ]),
        WS,
      ),
    );
    const sourcesEvent = events.find((e) => e.type === "sources");
    expect(sourcesEvent).toMatchObject({ type: "sources", sources: [] });
  });
});

// ---------------------------------------------------------------------------
// done/max_steps → error + done
// ---------------------------------------------------------------------------
describe("askAgentToSSE — done/max_steps mapping", () => {
  it("emits error with max_steps message when finishReason=max_steps", async () => {
    const events = await collect(
      askAgentToSSE(
        fromEvents([
          { type: "done", finishReason: "max_steps", steps: 8, totalTokens: 200 },
        ]),
        WS,
      ),
    );
    const errEvent = events.find((e) => e.type === "error");
    expect(errEvent).toMatchObject({
      type: "error",
      message: expect.stringContaining("MAX_TOOL_STEPS"),
    });
  });

  it("emits done after error for max_steps", async () => {
    const events = await collect(
      askAgentToSSE(
        fromEvents([
          { type: "done", finishReason: "max_steps", steps: 8, totalTokens: 200 },
        ]),
        WS,
      ),
    );
    const types = events.map((e) => e.type);
    expect(types).toContain("error");
    expect(types).toContain("done");
    expect(types.indexOf("done")).toBeGreaterThan(types.indexOf("error"));
  });
});

// ---------------------------------------------------------------------------
// done/error → error + done
// ---------------------------------------------------------------------------
describe("askAgentToSSE — done/error mapping", () => {
  it("emits agent error message when finishReason=error", async () => {
    const events = await collect(
      askAgentToSSE(
        fromEvents([
          { type: "done", finishReason: "error", steps: 1, totalTokens: 0 },
        ]),
        WS,
      ),
    );
    const errEvent = events.find((e) => e.type === "error");
    expect(errEvent).toMatchObject({
      type: "error",
      message: expect.stringContaining("에이전트 실행 중"),
    });
  });
});

// ---------------------------------------------------------------------------
// tool-call → dropped (no SSE event emitted)
// ---------------------------------------------------------------------------
describe("askAgentToSSE — tool-call dropped", () => {
  it("does not emit any SSE event for tool-call events", async () => {
    const events = await collect(
      askAgentToSSE(
        fromEvents([
          { type: "tool-call", name: "wiki_grep", input: {}, callId: "c1" },
          { type: "done", finishReason: "stop", steps: 1, totalTokens: 10 },
        ]),
        WS,
      ),
    );
    const types = events.map((e) => e.type);
    // tool-call should NOT appear in SSE output
    expect(types).not.toContain("tool-call");
  });
});

// ---------------------------------------------------------------------------
// tool-result → dropped from stream (accumulated as source side-effect)
// ---------------------------------------------------------------------------
describe("askAgentToSSE — tool-result handling", () => {
  it("does not emit SSE events for tool-result", async () => {
    const events = await collect(
      askAgentToSSE(
        fromEvents([
          {
            type: "tool-result",
            name: "wiki_read",
            callId: "c1",
            ok: true,
            data: { slug: "foo", title: "Foo", path: "auto/Foo.md", sensitivity: "PUBLIC" },
          },
          { type: "done", finishReason: "stop", steps: 1, totalTokens: 10 },
        ]),
        WS,
      ),
    );
    const types = events.map((e) => e.type);
    expect(types).not.toContain("tool-result");
  });

  // -------------------------------------------------------------------------
  // wiki_read sources are harvested into the sources SSE event
  // -------------------------------------------------------------------------
  it("harvests wiki_read result into sources event", async () => {
    const events = await collect(
      askAgentToSSE(
        fromEvents([
          {
            type: "tool-result",
            name: "wiki_read",
            callId: "c1",
            ok: true,
            data: { slug: "foo", title: "Foo Title", path: "auto/Foo.md", sensitivity: "PUBLIC" },
          },
          { type: "text", text: "답변" },
          { type: "done", finishReason: "stop", steps: 2, totalTokens: 50 },
        ]),
        WS,
      ),
    );
    const sourcesEvent = events.find((e) => e.type === "sources") as
      | { type: "sources"; sources: Array<{ slug: string; title: string }> }
      | undefined;
    expect(sourcesEvent).toBeDefined();
    expect(sourcesEvent!.sources).toHaveLength(1);
    expect(sourcesEvent!.sources[0]).toMatchObject({ slug: "foo", title: "Foo Title" });
  });

  it("deduplicates wiki_read results with same slug", async () => {
    const events = await collect(
      askAgentToSSE(
        fromEvents([
          {
            type: "tool-result",
            name: "wiki_read",
            callId: "c1",
            ok: true,
            data: { slug: "foo", title: "Foo Title", path: "auto/Foo.md", sensitivity: "PUBLIC" },
          },
          {
            type: "tool-result",
            name: "wiki_read",
            callId: "c2",
            ok: true,
            data: { slug: "foo", title: "Foo Title", path: "auto/Foo.md", sensitivity: "PUBLIC" },
          },
          { type: "done", finishReason: "stop", steps: 2, totalTokens: 80 },
        ]),
        WS,
      ),
    );
    const sourcesEvent = events.find((e) => e.type === "sources") as
      | { type: "sources"; sources: Array<{ slug: string }> }
      | undefined;
    expect(sourcesEvent!.sources).toHaveLength(1);
    expect(sourcesEvent!.sources[0]!.slug).toBe("foo");
  });

  it("does NOT harvest non-wiki_read tool results into sources", async () => {
    const events = await collect(
      askAgentToSSE(
        fromEvents([
          {
            type: "tool-result",
            name: "wiki_grep",
            callId: "c1",
            ok: true,
            data: { slug: "foo", title: "Foo", path: "auto/Foo.md", sensitivity: "PUBLIC" },
          },
          {
            type: "tool-result",
            name: "wiki_follow_link",
            callId: "c2",
            ok: true,
            data: { slug: "bar", title: "Bar", path: "auto/Bar.md", sensitivity: "PUBLIC" },
          },
          {
            type: "tool-result",
            name: "wiki_graph_query",
            callId: "c3",
            ok: true,
            data: { slug: "baz", title: "Baz", path: "auto/Baz.md", sensitivity: "PUBLIC" },
          },
          { type: "done", finishReason: "stop", steps: 2, totalTokens: 60 },
        ]),
        WS,
      ),
    );
    const sourcesEvent = events.find((e) => e.type === "sources") as
      | { type: "sources"; sources: unknown[] }
      | undefined;
    // Only wiki_read results should appear — wiki_grep/follow_link/graph_query must NOT
    expect(sourcesEvent!.sources).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Event order: text → sources → done (full happy path)
// ---------------------------------------------------------------------------
describe("askAgentToSSE — full happy path event order", () => {
  it("emits text, sources, done in correct order", async () => {
    const events = await collect(
      askAgentToSSE(
        fromEvents([
          { type: "tool-call", name: "wiki_grep", input: {}, callId: "c1" },
          { type: "tool-result", name: "wiki_grep", callId: "c1", ok: true },
          { type: "text", text: "답변 텍스트입니다." },
          { type: "done", finishReason: "stop", steps: 2, totalTokens: 75 },
        ]),
        WS,
      ),
    );
    const types = events.map((e) => e.type);
    expect(types).toEqual(["text", "sources", "done"]);
  });
});

// ---------------------------------------------------------------------------
// isWikiReadOutput runtime guard — malformed data must not produce sources
// ---------------------------------------------------------------------------
describe("askAgentToSSE — wiki_read runtime guard", () => {
  it("does NOT harvest wiki_read result when title is missing (guard rejects)", async () => {
    const events = await collect(
      askAgentToSSE(
        fromEvents([
          {
            type: "tool-result",
            name: "wiki_read",
            callId: "c1",
            ok: true,
            // title and path are missing — guard must reject this
            data: { slug: "x" },
          },
          { type: "done", finishReason: "stop", steps: 1, totalTokens: 10 },
        ]),
        WS,
      ),
    );
    const sourcesEvent = events.find((e) => e.type === "sources") as
      | { type: "sources"; sources: unknown[] }
      | undefined;
    // Malformed data — isWikiReadOutput rejects it, no source harvested.
    expect(sourcesEvent!.sources).toHaveLength(0);
  });

  it("harvests wiki_read result when all required fields are present", async () => {
    const events = await collect(
      askAgentToSSE(
        fromEvents([
          {
            type: "tool-result",
            name: "wiki_read",
            callId: "c1",
            ok: true,
            data: { slug: "valid-slug", title: "Valid Title", path: "auto/valid.md", sensitivity: "PUBLIC" },
          },
          { type: "done", finishReason: "stop", steps: 1, totalTokens: 10 },
        ]),
        WS,
      ),
    );
    const sourcesEvent = events.find((e) => e.type === "sources") as
      | { type: "sources"; sources: Array<{ slug: string }> }
      | undefined;
    expect(sourcesEvent!.sources).toHaveLength(1);
    expect(sourcesEvent!.sources[0]!.slug).toBe("valid-slug");
  });
});

// ---------------------------------------------------------------------------
// Token tracking end-to-end
// ---------------------------------------------------------------------------
describe("askAgentToSSE — token tracking", () => {
  it("propagates totalTokens from agent done event to SSE done event", async () => {
    const events = await collect(
      askAgentToSSE(
        fromEvents([
          { type: "text", text: "ok" },
          { type: "done", finishReason: "stop", steps: 3, totalTokens: 999 },
        ]),
        WS,
      ),
    );
    const doneEvent = events.find((e) => e.type === "done");
    expect(doneEvent).toMatchObject({ type: "done", totalTokens: 999 });
  });
});
