// packages/ai/agent/__tests__/ask-agent-stream.test.ts
//
// Phase B2 — askAgentStream (AsyncGenerator<AskAgentEvent>) 단위 테스트.
// 이벤트 순서 · 병렬 tool-call · 에러 전파 · max_steps 를 검증한다.

import { beforeEach, describe, expect, it, vi } from "vitest";

const { grepExec, readExec, followExec, graphExec } = vi.hoisted(() => ({
  grepExec: vi.fn(),
  readExec: vi.fn(),
  followExec: vi.fn(),
  graphExec: vi.fn(),
}));

vi.mock("../tools/wiki-grep.js", () => ({
  wikiGrep: {
    name: "wiki_grep",
    description: "grep",
    parameters: { type: "object" },
    execute: grepExec,
  },
}));
vi.mock("../tools/wiki-read.js", () => ({
  wikiRead: {
    name: "wiki_read",
    description: "read",
    parameters: { type: "object" },
    execute: readExec,
  },
}));
vi.mock("../tools/wiki-follow-link.js", () => ({
  wikiFollowLink: {
    name: "wiki_follow_link",
    description: "follow",
    parameters: { type: "object" },
    execute: followExec,
  },
}));
vi.mock("../tools/wiki-graph-query.js", () => ({
  wikiGraphQuery: {
    name: "wiki_graph_query",
    description: "graph",
    parameters: { type: "object" },
    execute: graphExec,
  },
}));

import { askAgentStream, MAX_TOOL_STEPS, type AskAgentEvent } from "../ask-agent.js";
import type { ToolContext } from "../tools/types.js";

function makeClient(
  sequence: Array<{ content?: string; toolCalls?: Array<{ id: string; name: string; args: unknown }> }>,
) {
  const create = vi.fn(async () => {
    const step = sequence.shift();
    if (!step) throw new Error("sequence exhausted");
    return {
      choices: [
        {
          message: {
            role: "assistant",
            content: step.content ?? null,
            tool_calls: (step.toolCalls ?? []).map((tc) => ({
              id: tc.id,
              type: "function",
              function: { name: tc.name, arguments: JSON.stringify(tc.args) },
            })),
          },
        },
      ],
    };
  });
  return { chat: { completions: { create } } };
}

async function collect(gen: AsyncGenerator<AskAgentEvent>): Promise<AskAgentEvent[]> {
  const out: AskAgentEvent[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

const ctx: ToolContext = { workspaceId: "ws-1", userId: "u-1", permissions: ["wiki:read"] };

beforeEach(() => {
  grepExec.mockReset();
  readExec.mockReset();
  followExec.mockReset();
  graphExec.mockReset();
});

describe("askAgentStream", () => {
  it("yields text + done when no tool call is made", async () => {
    const client = makeClient([{ content: "즉답입니다." }]);
    const events = await collect(askAgentStream("안녕", ctx, { client: client as never }));
    expect(events.map((e) => e.type)).toEqual(["text", "done"]);
    expect(events[0]).toEqual({ type: "text", text: "즉답입니다." });
    const done = events[events.length - 1];
    expect(done).toMatchObject({ type: "done", finishReason: "stop", totalTokens: expect.any(Number) });
  });

  it("yields tool-call → tool-result → text → done for one tool step", async () => {
    grepExec.mockResolvedValue({ ok: true, data: { matches: [] } });
    const client = makeClient([
      { toolCalls: [{ id: "c1", name: "wiki_grep", args: { query: "대출" } }] },
      { content: "[[a]] 답변" },
    ]);
    const events = await collect(askAgentStream("대출?", ctx, { client: client as never }));
    expect(events.map((e) => e.type)).toEqual([
      "tool-call",
      "tool-result",
      "text",
      "done",
    ]);
    expect(events[0]).toMatchObject({ type: "tool-call", name: "wiki_grep" });
    expect(events[1]).toMatchObject({ type: "tool-result", name: "wiki_grep", ok: true });
  });

  it("parallel tool calls yield tool-call×n then tool-result×n preserving order", async () => {
    grepExec.mockResolvedValue({ ok: true, data: { matches: [] } });
    readExec.mockResolvedValue({ ok: true, data: {} });
    const client = makeClient([
      {
        toolCalls: [
          { id: "c1", name: "wiki_grep", args: { query: "a" } },
          { id: "c2", name: "wiki_read", args: { slug: "x" } },
        ],
      },
      { content: "OK" },
    ]);
    const events = await collect(askAgentStream("?", ctx, { client: client as never }));
    expect(events.map((e) => e.type)).toEqual([
      "tool-call",
      "tool-call",
      "tool-result",
      "tool-result",
      "text",
      "done",
    ]);
  });

  it("tool-result carries error for failed tool executions", async () => {
    grepExec.mockResolvedValue({ ok: false, code: "invalid", error: "too short" });
    const client = makeClient([
      { toolCalls: [{ id: "c1", name: "wiki_grep", args: { query: "a" } }] },
      { content: "죄송" },
    ]);
    const events = await collect(askAgentStream("a", ctx, { client: client as never }));
    const result = events.find((e) => e.type === "tool-result");
    expect(result).toBeDefined();
    expect(result).toMatchObject({ type: "tool-result", ok: false });
    if (result && result.type === "tool-result") expect(result.error).toContain("too short");
  });

  it("emits done{max_steps} when the loop exceeds MAX_TOOL_STEPS", async () => {
    grepExec.mockResolvedValue({ ok: true, data: { matches: [] } });
    const seq = Array.from({ length: MAX_TOOL_STEPS + 1 }, (_, i) => ({
      toolCalls: [{ id: `c${i}`, name: "wiki_grep", args: { query: "x" } }],
    }));
    const client = makeClient(seq);
    const events = await collect(askAgentStream("?", ctx, { client: client as never }));
    const done = events[events.length - 1];
    expect(done).toMatchObject({ type: "done", finishReason: "max_steps", steps: MAX_TOOL_STEPS, totalTokens: expect.any(Number) });
    // tool-call / tool-result 쌍이 MAX_TOOL_STEPS 만큼 들어있어야 함
    const calls = events.filter((e) => e.type === "tool-call");
    expect(calls.length).toBe(MAX_TOOL_STEPS);
  });

  it("does not emit text event when content is null/empty", async () => {
    grepExec.mockResolvedValue({ ok: true, data: { matches: [] } });
    const client = makeClient([
      { toolCalls: [{ id: "c1", name: "wiki_grep", args: {} }] },
      { content: "" },
    ]);
    const events = await collect(askAgentStream("?", ctx, { client: client as never }));
    const texts = events.filter((e) => e.type === "text");
    expect(texts.length).toBe(0);
    const done = events[events.length - 1];
    expect(done).toMatchObject({ type: "done", finishReason: "stop", totalTokens: expect.any(Number) });
  });
});
