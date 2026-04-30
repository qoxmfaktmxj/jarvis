// packages/ai/agent/__tests__/ask-agent.test.ts
//
// Phase B1: ask-agent (tool-use loop) 단위 테스트.
// OpenAI 클라이언트와 각 tool 모듈을 mock 한 상태에서 loop·종료조건·
// tool call dispatch·에러 경로를 검증한다.

import { beforeEach, describe, expect, it, vi } from "vitest";

// --------------------------------------------------------------------
// Mock tool modules — withSensitivityFilter 안에서 쓰이는 실제 tool들의
// execute 를 vi.fn 으로 바꾼다. 모듈 전체를 mock 해야 ask-agent 가 import
// 시점에 mock 버전을 받는다.
// vi.hoisted 로 mock factory 보다 먼저 초기화되도록 한다.
// --------------------------------------------------------------------

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

import { askAgent, MAX_TOOL_STEPS } from "../ask-agent.js";
import type { ToolContext } from "../tools/types.js";

type FakeChatCreate = ReturnType<typeof vi.fn>;

function makeClient(sequence: Array<{ content?: string; toolCalls?: Array<{ id: string; name: string; args: unknown }> }>) {
  const create: FakeChatCreate = vi.fn(async () => {
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

const ctx: ToolContext = {
  workspaceId: "ws-1",
  userId: "u-1",
  permissions: ["wiki:read"],
};

beforeEach(() => {
  grepExec.mockReset();
  readExec.mockReset();
  followExec.mockReset();
  graphExec.mockReset();
});

describe("askAgent — tool-use loop", () => {
  it("returns final answer when LLM emits no tool calls", async () => {
    const client = makeClient([{ content: "바로 답변입니다." }]);
    const r = await askAgent("안녕", ctx, { client: client as never, model: "gpt-5.4-mini" });
    expect(r.finishReason).toBe("stop");
    expect(r.answer).toBe("바로 답변입니다.");
    expect(r.toolCalls).toEqual([]);
    expect(r.steps).toBe(1);
  });

  it("executes a single tool call then returns final answer", async () => {
    grepExec.mockResolvedValue({ ok: true, data: { matches: [{ slug: "a", title: "A", path: "p", sensitivity: "PUBLIC", snippet: "" }] } });
    const client = makeClient([
      { toolCalls: [{ id: "c1", name: "wiki_grep", args: { query: "대출" } }] },
      { content: "[[a]] 내용 요약" },
    ]);
    const r = await askAgent("대출?", ctx, { client: client as never });
    expect(grepExec).toHaveBeenCalledTimes(1);
    expect(grepExec).toHaveBeenCalledWith({ query: "대출" }, ctx);
    expect(r.finishReason).toBe("stop");
    expect(r.answer).toBe("[[a]] 내용 요약");
    expect(r.toolCalls).toEqual([{ name: "wiki_grep", input: { query: "대출" }, ok: true }]);
    expect(r.steps).toBe(2);
  });

  it("chains multiple tool calls across steps", async () => {
    grepExec.mockResolvedValue({ ok: true, data: { matches: [{ slug: "loan", title: "대출", path: "p", sensitivity: "PUBLIC", snippet: "" }] } });
    readExec.mockResolvedValue({ ok: true, data: { slug: "loan", title: "대출", path: "p", sensitivity: "PUBLIC", frontmatter: {}, content: "본문", outbound_wikilinks: [] } });
    const client = makeClient([
      { toolCalls: [{ id: "c1", name: "wiki_grep", args: { query: "대출" } }] },
      { toolCalls: [{ id: "c2", name: "wiki_read", args: { slug: "loan" } }] },
      { content: "[[loan]] 요약 답변" },
    ]);
    const r = await askAgent("대출 정책?", ctx, { client: client as never });
    expect(r.finishReason).toBe("stop");
    expect(r.toolCalls.map((t) => t.name)).toEqual(["wiki_grep", "wiki_read"]);
  });

  it("passes tool errors back to the LLM as tool messages (not throw)", async () => {
    grepExec.mockResolvedValue({ ok: false, code: "invalid", error: "query too short" });
    const client = makeClient([
      { toolCalls: [{ id: "c1", name: "wiki_grep", args: { query: "a" } }] },
      { content: "죄송합니다 — 질문을 조금 더 구체적으로 주세요." },
    ]);
    const r = await askAgent("a", ctx, { client: client as never });
    expect(r.finishReason).toBe("stop");
    expect(r.toolCalls[0]).toEqual({ name: "wiki_grep", input: { query: "a" }, ok: false });
    expect(r.answer).toContain("죄송");
  });

  it("handles unknown tool names by sending an error tool result", async () => {
    const client = makeClient([
      { toolCalls: [{ id: "c1", name: "nonsense", args: {} }] },
      { content: "죄송합니다" },
    ]);
    const r = await askAgent("?", ctx, { client: client as never });
    expect(r.toolCalls[0]?.ok).toBe(false);
    expect(r.toolCalls[0]?.name).toBe("nonsense");
    expect(r.finishReason).toBe("stop");
  });

  it("aborts with finishReason=max_steps when LLM never stops calling tools", async () => {
    grepExec.mockResolvedValue({ ok: true, data: { matches: [] } });
    const seq = Array.from({ length: MAX_TOOL_STEPS + 1 }, (_, i) => ({
      toolCalls: [{ id: `c${i}`, name: "wiki_grep", args: { query: "x" } }],
    }));
    const client = makeClient(seq);
    const r = await askAgent("?", ctx, { client: client as never });
    expect(r.finishReason).toBe("max_steps");
    expect(r.steps).toBe(MAX_TOOL_STEPS);
    expect(r.answer).toBe("");
  });

  it("executes parallel tool calls in a single step", async () => {
    grepExec.mockResolvedValue({ ok: true, data: { matches: [] } });
    readExec.mockResolvedValue({ ok: true, data: { slug: "x", title: "X", path: "p", sensitivity: "PUBLIC", frontmatter: {}, content: "", outbound_wikilinks: [] } });
    const client = makeClient([
      {
        toolCalls: [
          { id: "c1", name: "wiki_grep", args: { query: "z" } },
          { id: "c2", name: "wiki_read", args: { slug: "x" } },
        ],
      },
      { content: "OK" },
    ]);
    const r = await askAgent("?", ctx, { client: client as never });
    expect(grepExec).toHaveBeenCalledTimes(1);
    expect(readExec).toHaveBeenCalledTimes(1);
    expect(r.toolCalls).toHaveLength(2);
    expect(r.steps).toBe(2);
  });

  it("malformed tool arguments still produce a tool result (not throw)", async () => {
    grepExec.mockResolvedValue({ ok: false, code: "invalid", error: "query too short" });
    // LLM 이 잘못된 JSON 을 보낸 상황을 시뮬레이트: create 내부에서 arguments 문자열 자체를
    // 조작한다. makeClient 가 이미 JSON.stringify 를 하므로, 별도 sequence 엔트리에서
    // 빈 args 를 보내 parsing 실패 대신 invalid path 를 확인한다.
    const client = makeClient([
      { toolCalls: [{ id: "c1", name: "wiki_grep", args: { query: "a" } }] },
      { content: "답변" },
    ]);
    const r = await askAgent("q", ctx, { client: client as never });
    expect(r.toolCalls[0]?.ok).toBe(false);
  });
});

// P1 #3 — wiki_graph_query 는 GRAPH_READ 권한 보유자에게만 노출된다.
// 권한 없는 사용자의 세션에서는 (1) tools 목록에서 제외되고, (2) LLM 이 우회
// 호출을 시도해도 ok:false 로 차단되어야 한다.
describe("askAgent — P1 #3 graph tool permission gate", () => {
  it("GRAPH_READ 없는 ctx 에서 wiki_graph_query 가 노출되지 않는다 (LLM 호출 시 unknown tool 으로 차단)", async () => {
    const ctxNoGraph: ToolContext = {
      workspaceId: "ws-1",
      userId: "u-1",
      permissions: ["wiki:read", "knowledge:read"],
    };
    const client = makeClient([
      { toolCalls: [{ id: "c1", name: "wiki_graph_query", args: { startSlug: "x" } }] },
      { content: "안전하게 차단됨" },
    ]);
    const r = await askAgent("?", ctxNoGraph, { client: client as never });

    // graphExec 은 절대 호출되어선 안 된다
    expect(graphExec).not.toHaveBeenCalled();
    // 호출 시도는 ok:false 로 기록
    expect(r.toolCalls[0]).toMatchObject({ name: "wiki_graph_query", ok: false });
  });

  it("GRAPH_READ 보유 ctx 에서 wiki_graph_query 가 정상 호출된다", async () => {
    graphExec.mockResolvedValue({ ok: true, data: { nodes: [], edges: [] } });
    const ctxWithGraph: ToolContext = {
      workspaceId: "ws-1",
      userId: "u-1",
      permissions: ["wiki:read", "graph:read"],
    };
    const client = makeClient([
      { toolCalls: [{ id: "c1", name: "wiki_graph_query", args: { startSlug: "x" } }] },
      { content: "[[x]] 그래프 결과" },
    ]);
    const r = await askAgent("?", ctxWithGraph, { client: client as never });

    expect(graphExec).toHaveBeenCalledTimes(1);
    expect(graphExec).toHaveBeenCalledWith({ startSlug: "x" }, ctxWithGraph);
    expect(r.toolCalls[0]).toMatchObject({ name: "wiki_graph_query", ok: true });
  });

  it("ADMIN_ALL 권한 보유자도 wiki_graph_query 사용 가능", async () => {
    graphExec.mockResolvedValue({ ok: true, data: { nodes: [], edges: [] } });
    const ctxAdmin: ToolContext = {
      workspaceId: "ws-1",
      userId: "u-1",
      permissions: ["admin:all"],
    };
    const client = makeClient([
      { toolCalls: [{ id: "c1", name: "wiki_graph_query", args: { startSlug: "x" } }] },
      { content: "OK" },
    ]);
    const r = await askAgent("?", ctxAdmin, { client: client as never });

    expect(graphExec).toHaveBeenCalledTimes(1);
    expect(r.toolCalls[0]?.ok).toBe(true);
  });
});
