/**
 * packages/ai/__tests__/page-first-synthesize.test.ts
 *
 * X2 — packages/ai page-first 단위 테스트 보강 (synthesize).
 *
 * SSE 이벤트 계약을 regression 으로 잠가둔다:
 *   1. 정상 path — `text*` → `sources` → `meta` → `done` 순서, done 은 항상 마지막.
 *   2. sources 에 WikiPageSourceRef 배열, citation 은 `[[slug]]` 포맷.
 *   3. BudgetExceededError → `error` 이벤트 emit 후 조기 종료.
 *   4. LLM 예외 mid-stream → error + sources + meta + done 을 terminal block 으로 emit.
 *   5. pages=[] → fallback text + 빈 sources + done.
 *   6. confidence 는 rank 에 따라 감소, origin=expand 페널티 반영.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "test-key";

vi.mock("@jarvis/db/client", () => ({
  db: {
    execute: vi.fn(),
    insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) })),
  },
}));

vi.mock("@jarvis/wiki-fs", () => ({
  readPage: vi.fn(async () => "---\ntitle: Fake\n---\n\nBody"),
  wikiRoot: () => "/tmp/wiki",
}));

// 기본 createChatWithTokenFallback mock — 각 테스트가 개별 덮어쓸 수 있음.
vi.mock("../openai-compat.js", () => ({
  createChatWithTokenFallback: vi.fn(async () => {
    async function* gen() {
      yield {
        choices: [{ delta: { content: "A pretty long answer that exceeds eighty characters so that eligibility becomes true." } }],
      };
      yield { choices: [{ delta: {} }], usage: { prompt_tokens: 100, completion_tokens: 20 } };
    }
    return gen();
  }),
}));

// budget mock — 기본은 통과, 특정 테스트에서 assertBudget 을 재설정.
vi.mock("../budget.js", () => {
  class BudgetExceededError extends Error {
    constructor(
      public workspaceId: string,
      public spent: number,
      public limit: number,
    ) {
      super(
        `LLM daily budget exceeded for workspace ${workspaceId}: $${spent.toFixed(
          4,
        )} >= $${limit.toFixed(2)}`,
      );
      this.name = "BudgetExceededError";
    }
  }
  return {
    assertBudget: vi.fn().mockResolvedValue(undefined),
    recordBlocked: vi.fn().mockResolvedValue(undefined),
    BudgetExceededError,
  };
});

vi.mock("../logger.js", () => ({
  logLlmCall: vi.fn().mockResolvedValue(undefined),
  logger: { info: vi.fn(), error: vi.fn(), child: vi.fn() },
  withRequestId: vi.fn(),
}));

import { synthesizePageFirstAnswer } from "../page-first/synthesize.js";
import type { SSEEvent } from "../types.js";
import type { LoadedPage } from "../page-first/read-pages.js";
import { assertBudget, BudgetExceededError, recordBlocked } from "../budget.js";
import { createChatWithTokenFallback } from "../openai-compat.js";

const WS = "00000000-0000-0000-0000-0000000000aa";

function makeLoadedPage(overrides: Partial<LoadedPage> = {}): LoadedPage {
  return {
    id: "p1",
    path: "auto/policy/vacation.md",
    title: "Vacation Policy",
    slug: "vacation-policy",
    sensitivity: "INTERNAL",
    origin: "shortlist",
    content: "휴가는 연 15일입니다.",
    ...overrides,
  };
}

async function collect(
  gen: AsyncGenerator<SSEEvent>,
): Promise<SSEEvent[]> {
  const out: SSEEvent[] = [];
  for await (const ev of gen) out.push(ev);
  return out;
}

describe("synthesizePageFirstAnswer — SSE event contract", () => {
  beforeEach(() => {
    vi.mocked(assertBudget).mockReset();
    vi.mocked(assertBudget).mockResolvedValue(undefined);
    vi.mocked(recordBlocked).mockReset();
    vi.mocked(recordBlocked).mockResolvedValue(undefined);
  });

  // ---------------------------------------------------------------------
  // 1) 정상 path — text → sources → meta → done, done 은 항상 마지막
  // ---------------------------------------------------------------------
  it("emits text → sources → meta → done in order, done is last", async () => {
    const events = await collect(
      synthesizePageFirstAnswer({
        question: "휴가 정책?",
        pages: [
          makeLoadedPage(),
          makeLoadedPage({
            id: "p2",
            path: "auto/policy/leave.md",
            title: "Leave",
            slug: "leave",
            origin: "expand",
          }),
        ],
        workspaceId: WS,
        requestId: "req-1",
      }),
    );

    const typeSequence = events.map((e) => e.type);
    // text 가 0회 이상 나오고, 그 뒤 반드시 sources → meta → done 순서.
    const sourcesIdx = typeSequence.indexOf("sources");
    const metaIdx = typeSequence.indexOf("meta");
    const doneIdx = typeSequence.indexOf("done");
    expect(sourcesIdx).toBeGreaterThan(-1);
    expect(metaIdx).toBeGreaterThan(sourcesIdx);
    expect(doneIdx).toBeGreaterThan(metaIdx);
    // done 은 항상 마지막.
    expect(events.at(-1)?.type).toBe("done");
  });

  // ---------------------------------------------------------------------
  // 2) sources 는 WikiPageSourceRef 배열이고 citation 은 `[[slug]]`
  // ---------------------------------------------------------------------
  it("sources event carries WikiPageSourceRef array with [[slug]] citation", async () => {
    const events = await collect(
      synthesizePageFirstAnswer({
        question: "휴가 정책?",
        pages: [
          makeLoadedPage({ slug: "vacation-policy" }),
          makeLoadedPage({
            id: "p2",
            slug: "leave",
            origin: "expand",
          }),
        ],
        workspaceId: WS,
        requestId: null,
      }),
    );

    const srcEvt = events.find((e) => e.type === "sources");
    expect(srcEvt).toBeDefined();
    if (srcEvt?.type !== "sources") throw new Error("not sources");

    expect(srcEvt.sources).toHaveLength(2);
    for (const s of srcEvt.sources) {
      expect(s.kind).toBe("wiki-page");
    }
    const s0 = srcEvt.sources[0]!;
    const s1 = srcEvt.sources[1]!;
    if (s0.kind === "wiki-page") {
      expect(s0.citation).toBe("[[vacation-policy]]");
      expect(s0.origin).toBe("shortlist");
    }
    if (s1.kind === "wiki-page") {
      expect(s1.citation).toBe("[[leave]]");
      expect(s1.origin).toBe("expand");
      // origin=expand 는 confidence 에 0.7 페널티.
      expect(s1.confidence).toBeLessThan(1);
    }
  });

  // ---------------------------------------------------------------------
  // 3) meta 이벤트 shape — pageFirst/pageCount/saveAsPageEligible
  // ---------------------------------------------------------------------
  it("meta event carries pageFirst=true, pageCount, and saveAsPageEligible flag", async () => {
    const events = await collect(
      synthesizePageFirstAnswer({
        question: "긴 답이 생성될 질문",
        pages: [
          makeLoadedPage({ slug: "a" }),
          makeLoadedPage({ id: "p2", slug: "b", origin: "expand" }),
        ],
        workspaceId: WS,
        requestId: null,
      }),
    );

    const metaEvt = events.find((e) => e.type === "meta");
    if (metaEvt?.type !== "meta") throw new Error("no meta");
    expect(metaEvt.meta.pageFirst).toBe(true);
    expect(metaEvt.meta.pageCount).toBe(2);
    // 기본 mock 답변은 80자 이상 + pages ≥2 → eligible=true
    expect(metaEvt.meta.saveAsPageEligible).toBe(true);
  });

  // ---------------------------------------------------------------------
  // 4) BudgetExceededError → error 이벤트 후 조기 종료
  // ---------------------------------------------------------------------
  it("emits single error event and returns when assertBudget throws BudgetExceededError", async () => {
    vi.mocked(assertBudget).mockRejectedValueOnce(
      new BudgetExceededError(WS, 10.5, 10),
    );

    const events = await collect(
      synthesizePageFirstAnswer({
        question: "any",
        pages: [makeLoadedPage()],
        workspaceId: WS,
        requestId: "req-9",
      }),
    );

    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("error");
    if (events[0]?.type === "error") {
      expect(events[0].message).toMatch(/budget/i);
    }
    expect(recordBlocked).toHaveBeenCalledTimes(1);
  });

  // ---------------------------------------------------------------------
  // 5) assertBudget 의 일반 Error 는 throw 전파 (error 이벤트 아님)
  // ---------------------------------------------------------------------
  it("rethrows non-budget errors from assertBudget instead of emitting error event", async () => {
    vi.mocked(assertBudget).mockRejectedValueOnce(new Error("db connection lost"));

    await expect(
      collect(
        synthesizePageFirstAnswer({
          question: "any",
          pages: [makeLoadedPage()],
          workspaceId: WS,
          requestId: null,
        }),
      ),
    ).rejects.toThrow(/db connection lost/);
  });

  // ---------------------------------------------------------------------
  // 6) pages=[] → fallback text + 빈 sources + done (LLM 호출 없음)
  // ---------------------------------------------------------------------
  it("handles empty pages with fallback text + empty sources + done (no LLM call)", async () => {
    vi.mocked(createChatWithTokenFallback).mockClear();

    const events = await collect(
      synthesizePageFirstAnswer({
        question: "없는 주제",
        pages: [],
        workspaceId: WS,
        requestId: null,
      }),
    );

    // LLM 호출은 없어야.
    expect(createChatWithTokenFallback).not.toHaveBeenCalled();

    const textEvt = events.find((e) => e.type === "text");
    expect(textEvt).toBeDefined();
    if (textEvt?.type === "text") {
      // 한국어 fallback 문구 일부.
      expect(textEvt.content).toMatch(/위키 페이지|키워드|다시/);
    }

    const sourcesEvt = events.find((e) => e.type === "sources");
    if (sourcesEvt?.type === "sources") {
      expect(sourcesEvt.sources).toEqual([]);
    }

    const metaEvt = events.find((e) => e.type === "meta");
    if (metaEvt?.type === "meta") {
      expect(metaEvt.meta.saveAsPageEligible).toBe(false);
      expect(metaEvt.meta.pageFirst).toBe(true);
    }

    expect(events.at(-1)?.type).toBe("done");
  });

  // ---------------------------------------------------------------------
  // 7) LLM 예외 mid-stream → error + sources + meta + done terminal block
  // ---------------------------------------------------------------------
  it("on mid-stream LLM failure, emits terminal error + sources + meta + done", async () => {
    vi.mocked(createChatWithTokenFallback).mockImplementationOnce(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (): Promise<any> => {
        async function* gen() {
          yield {
            choices: [{ delta: { content: "partial " } }],
          };
          throw new Error("network blip");
        }
        return gen();
      },
    );

    const events = await collect(
      synthesizePageFirstAnswer({
        question: "any",
        pages: [makeLoadedPage()],
        workspaceId: WS,
        requestId: null,
      }),
    );

    const types = events.map((e) => e.type);
    expect(types).toContain("error");
    // terminal block 포함.
    expect(types).toContain("sources");
    expect(types).toContain("meta");
    expect(events.at(-1)?.type).toBe("done");

    const errEvt = events.find((e) => e.type === "error");
    if (errEvt?.type === "error") {
      expect(errEvt.message).toMatch(/network blip/);
    }
  });

  // ---------------------------------------------------------------------
  // 8) saveAsPageEligible 은 (pages ≥ 2 AND answer ≥ 80자) 조합일 때만 true.
  //    여기서는 pages=1 로 답변이 충분히 길어도 eligible=false 인지 확인.
  // ---------------------------------------------------------------------
  it("saveAsPageEligible is false when only one page even if answer is long", async () => {
    const events = await collect(
      synthesizePageFirstAnswer({
        question: "단일 페이지 기반 질문",
        pages: [makeLoadedPage()],
        workspaceId: WS,
        requestId: null,
      }),
    );
    const metaEvt = events.find((e) => e.type === "meta");
    if (metaEvt?.type === "meta") {
      expect(metaEvt.meta.saveAsPageEligible).toBe(false);
      expect(metaEvt.meta.pageCount).toBe(1);
    }
  });

  // ---------------------------------------------------------------------
  // 9) rank 기반 confidence — 첫 번째 source 가 두 번째보다 confidence 높다
  //    (둘 다 같은 origin=shortlist 일 때 rank 페널티만 반영되는지)
  // ---------------------------------------------------------------------
  it("confidence falls off with rank for same-origin sources", async () => {
    const events = await collect(
      synthesizePageFirstAnswer({
        question: "순서",
        pages: [
          makeLoadedPage({ id: "p1", slug: "p1" }),
          makeLoadedPage({ id: "p2", slug: "p2" }),
          makeLoadedPage({ id: "p3", slug: "p3" }),
        ],
        workspaceId: WS,
        requestId: null,
      }),
    );
    const srcEvt = events.find((e) => e.type === "sources");
    if (srcEvt?.type !== "sources") throw new Error("no sources");
    const [s0, s1, s2] = srcEvt.sources;
    if (s0?.kind === "wiki-page" && s1?.kind === "wiki-page" && s2?.kind === "wiki-page") {
      expect(s0.confidence).toBeGreaterThan(s1.confidence);
      expect(s1.confidence).toBeGreaterThan(s2.confidence);
    } else {
      throw new Error("expected three wiki-page sources");
    }
  });
});
