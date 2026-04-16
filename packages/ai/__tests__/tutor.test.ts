/**
 * packages/ai/__tests__/tutor.test.ts
 *
 * tutor.ts — page-first retrieval pipeline 전환 후 단위 테스트.
 *
 * 검증 항목:
 *   (a) sources 이벤트에 WikiPageSourceRef (kind='wiki-page') 포함
 *   (b) mode별 system prompt 주입 (guide/quiz/simulation)
 *   (c) multi-turn session.messages 전달
 *   (d) retrieveRelevantClaims 미호출
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// OpenAI SDK throws at construction time without key; set dummy before imports.
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "test-key";

// Mock the openai module to prevent constructor validation
vi.mock("openai", () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      chat: { completions: { create: vi.fn() } },
    })),
  };
});

// ── page-first retrieval mocks ────────────────────────────────────────
const mockLexicalShortlist = vi.fn();
const mockExpandOneHop = vi.fn();
const mockReadTopPages = vi.fn();

vi.mock("../page-first/shortlist.js", () => ({
  lexicalShortlist: (...args: unknown[]) => mockLexicalShortlist(...args),
}));

vi.mock("../page-first/expand.js", () => ({
  expandOneHop: (...args: unknown[]) => mockExpandOneHop(...args),
}));

vi.mock("../page-first/read-pages.js", () => ({
  readTopPages: (...args: unknown[]) => mockReadTopPages(...args),
}));

// ── case-context / directory-context mocks ────────────────────────────
const mockRetrieveRelevantCases = vi.fn();
const mockSearchDirectory = vi.fn();
const mockToCaseSourceRef = vi.fn();
const mockToDirectorySourceRef = vi.fn();

vi.mock("../case-context.js", () => ({
  retrieveRelevantCases: (...args: unknown[]) => mockRetrieveRelevantCases(...args),
  toCaseSourceRef: (...args: unknown[]) => mockToCaseSourceRef(...args),
}));

vi.mock("../directory-context.js", () => ({
  searchDirectory: (...args: unknown[]) => mockSearchDirectory(...args),
  toDirectorySourceRef: (...args: unknown[]) => mockToDirectorySourceRef(...args),
}));

// ── ask.ts mock: ensure retrieveRelevantClaims is NOT called ──────────
const mockRetrieveRelevantClaims = vi.fn();
vi.mock("../ask.js", () => ({
  retrieveRelevantClaims: (...args: unknown[]) => mockRetrieveRelevantClaims(...args),
}));

// ── OpenAI mock: stream a fixed answer ────────────────────────────────
const mockCreateChat = vi.fn();
vi.mock("../openai-compat.js", () => ({
  createChatWithTokenFallback: (...args: unknown[]) => mockCreateChat(...args),
}));

import { tutorAI, type TutorSession } from "../tutor.js";
import type { SSEEvent, AskQuery, WikiPageSourceRef } from "../types.js";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------
const WS = "00000000-0000-0000-0000-0000000000aa";

const FAKE_SHORTLIST = [
  {
    id: "p1",
    path: "auto/policy/vacation.md",
    title: "Vacation Policy",
    slug: "vacation-policy",
    sensitivity: "INTERNAL",
    requiredPermission: null,
    updatedAt: new Date("2026-04-10"),
    score: 9.5,
  },
  {
    id: "p2",
    path: "auto/policy/leave.md",
    title: "Leave Guide",
    slug: "leave-guide",
    sensitivity: "INTERNAL",
    requiredPermission: null,
    updatedAt: new Date("2026-04-09"),
    score: 8.0,
  },
];

const FAKE_EXPANDED = FAKE_SHORTLIST.map((s) => ({
  ...s,
  origin: "shortlist" as const,
  inboundCount: 0,
}));

const FAKE_PAGES = [
  {
    id: "p1",
    path: "auto/policy/vacation.md",
    title: "Vacation Policy",
    slug: "vacation-policy",
    sensitivity: "INTERNAL",
    origin: "shortlist" as const,
    content: "연차는 1년에 15일입니다. 입사 첫 해에는 비례 적용됩니다.",
  },
  {
    id: "p2",
    path: "auto/policy/leave.md",
    title: "Leave Guide",
    slug: "leave-guide",
    sensitivity: "INTERNAL",
    origin: "expand" as const,
    content: "병가는 유급 3일, 무급 30일까지 가능합니다.",
  },
];

function makeQuery(overrides: Partial<AskQuery> = {}): AskQuery {
  return {
    question: "휴가 정책 알려줘",
    workspaceId: WS,
    userId: "u1",
    userRoles: ["DEVELOPER"],
    userPermissions: ["knowledge:read"],
    ...overrides,
  };
}

function makeSession(overrides: Partial<TutorSession> = {}): TutorSession {
  return {
    mode: "guide",
    topic: "leave",
    messages: [],
    sources: [],
    ...overrides,
  };
}

async function* fakeStream() {
  yield {
    choices: [{ delta: { content: "연차는 15일입니다 [[vacation-policy]]." } }],
  };
  yield {
    choices: [{ delta: {} }],
    usage: { total_tokens: 120 },
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
function resetMocks() {
  mockLexicalShortlist.mockReset().mockResolvedValue(FAKE_SHORTLIST);
  mockExpandOneHop.mockReset().mockResolvedValue(FAKE_EXPANDED);
  mockReadTopPages.mockReset().mockResolvedValue(FAKE_PAGES);
  mockRetrieveRelevantCases.mockReset().mockResolvedValue({
    cases: [],
    xml: "",
  });
  mockSearchDirectory.mockReset().mockResolvedValue({
    entries: [],
    xml: "",
  });
  mockToCaseSourceRef.mockReset();
  mockToDirectorySourceRef.mockReset();
  mockRetrieveRelevantClaims.mockReset();
  mockCreateChat.mockReset().mockImplementation(async () => fakeStream());
}

async function collectEvents(
  query: AskQuery,
  session: TutorSession,
): Promise<SSEEvent[]> {
  const events: SSEEvent[] = [];
  for await (const ev of tutorAI(query, session)) {
    events.push(ev);
  }
  return events;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("tutorAI — page-first pipeline", () => {
  beforeEach(resetMocks);

  it("emits WikiPageSourceRef sources (kind='wiki-page') with [[slug]] citations", async () => {
    const events = await collectEvents(makeQuery(), makeSession());

    const sourcesEvt = events.find((e) => e.type === "sources");
    expect(sourcesEvt).toBeDefined();
    expect(sourcesEvt!.type).toBe("sources");

    if (sourcesEvt?.type === "sources") {
      expect(sourcesEvt.sources.length).toBeGreaterThanOrEqual(2);

      const wikiSources = sourcesEvt.sources.filter(
        (s): s is WikiPageSourceRef => s.kind === "wiki-page",
      );
      expect(wikiSources).toHaveLength(2);
      expect(wikiSources[0]!.citation).toBe("[[vacation-policy]]");
      expect(wikiSources[0]!.slug).toBe("vacation-policy");
      expect(wikiSources[0]!.origin).toBe("shortlist");
      expect(wikiSources[1]!.citation).toBe("[[leave-guide]]");
      expect(wikiSources[1]!.origin).toBe("expand");
    }
  });

  it("SSE event order: sources -> text -> done", async () => {
    const events = await collectEvents(makeQuery(), makeSession());

    const types = events.map((e) => e.type);
    const sourcesIdx = types.indexOf("sources");
    const textIdx = types.indexOf("text");
    const doneIdx = types.indexOf("done");

    expect(sourcesIdx).toBeGreaterThanOrEqual(0);
    expect(textIdx).toBeGreaterThan(sourcesIdx);
    expect(doneIdx).toBeGreaterThan(textIdx);
  });

  it("does NOT call retrieveRelevantClaims (legacy path)", async () => {
    await collectEvents(makeQuery(), makeSession());
    expect(mockRetrieveRelevantClaims).not.toHaveBeenCalled();
  });

  it("calls page-first retrieval pipeline (shortlist + expand + readTopPages)", async () => {
    await collectEvents(makeQuery(), makeSession());

    expect(mockLexicalShortlist).toHaveBeenCalledTimes(1);
    expect(mockLexicalShortlist).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: WS,
        question: "휴가 정책 알려줘",
        topK: 20,
      }),
    );

    expect(mockExpandOneHop).toHaveBeenCalledTimes(1);
    expect(mockExpandOneHop).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: WS,
        shortlist: FAKE_SHORTLIST,
        fanOut: 30,
      }),
    );

    expect(mockReadTopPages).toHaveBeenCalledTimes(1);
    expect(mockReadTopPages).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: WS,
        candidates: FAKE_EXPANDED,
        topN: 7,
      }),
    );
  });

  it("mode=guide injects TUTOR_GUIDE_PROMPT as system message", async () => {
    await collectEvents(makeQuery(), makeSession({ mode: "guide" }));

    const callArgs = mockCreateChat.mock.calls[0]!;
    const reqBody = callArgs[2] as { messages: Array<{ role: string; content: string }> };
    const systemMessages = reqBody.messages.filter((m) => m.role === "system");

    expect(systemMessages.length).toBeGreaterThanOrEqual(2);
    expect(systemMessages[0]!.content).toContain("Jarvis HR 튜터입니다");
    expect(systemMessages[0]!.content).not.toContain("퀴즈");
  });

  it("mode=quiz injects TUTOR_QUIZ_PROMPT as system message", async () => {
    await collectEvents(makeQuery(), makeSession({ mode: "quiz" }));

    const callArgs = mockCreateChat.mock.calls[0]!;
    const reqBody = callArgs[2] as { messages: Array<{ role: string; content: string }> };
    const systemMessages = reqBody.messages.filter((m) => m.role === "system");

    expect(systemMessages[0]!.content).toContain("퀴즈 마스터");
  });

  it("mode=simulation injects TUTOR_SIM_PROMPT as system message", async () => {
    await collectEvents(makeQuery(), makeSession({ mode: "simulation" }));

    const callArgs = mockCreateChat.mock.calls[0]!;
    const reqBody = callArgs[2] as { messages: Array<{ role: string; content: string }> };
    const systemMessages = reqBody.messages.filter((m) => m.role === "system");

    expect(systemMessages[0]!.content).toContain("시뮬레이터");
  });

  it("passes multi-turn session.messages to OpenAI", async () => {
    const session = makeSession({
      messages: [
        { role: "user", content: "휴가가 뭐야?" },
        { role: "assistant", content: "연차와 반차가 있습니다." },
        { role: "user", content: "연차 몇 일이야?" },
      ],
    });

    await collectEvents(makeQuery({ question: "더 자세히 알려줘" }), session);

    const callArgs = mockCreateChat.mock.calls[0]!;
    const reqBody = callArgs[2] as { messages: Array<{ role: string; content: string }> };

    // system(tutor prompt) + system(context) + 3 history messages + 1 current user question
    expect(reqBody.messages).toHaveLength(6);
    expect(reqBody.messages[2]!.content).toBe("휴가가 뭐야?");
    expect(reqBody.messages[3]!.content).toBe("연차와 반차가 있습니다.");
    expect(reqBody.messages[4]!.content).toBe("연차 몇 일이야?");
    expect(reqBody.messages[5]!.content).toBe("더 자세히 알려줘");
  });

  it("degrades gracefully when expandOneHop fails", async () => {
    mockExpandOneHop.mockRejectedValueOnce(new Error("link table down"));

    // readTopPages should still be called with shortlist-only fallback
    const events = await collectEvents(makeQuery(), makeSession());

    expect(mockReadTopPages).toHaveBeenCalledTimes(1);
    const readCall = mockReadTopPages.mock.calls[0]![0] as {
      candidates: Array<{ origin: string }>;
    };
    // All candidates should be 'shortlist' origin (no expand results)
    expect(readCall.candidates.every((c) => c.origin === "shortlist")).toBe(true);

    // Should still produce valid SSE events
    expect(events.some((e) => e.type === "sources")).toBe(true);
    expect(events.some((e) => e.type === "done")).toBe(true);
  });

  it("context XML uses wiki-page format with slug and title", async () => {
    await collectEvents(makeQuery(), makeSession());

    const callArgs = mockCreateChat.mock.calls[0]!;
    const reqBody = callArgs[2] as { messages: Array<{ role: string; content: string }> };
    const contextMsg = reqBody.messages[1]!;

    expect(contextMsg.role).toBe("system");
    expect(contextMsg.content).toContain("<context>");
    expect(contextMsg.content).toContain('kind="wiki-page"');
    expect(contextMsg.content).toContain('slug="vacation-policy"');
    expect(contextMsg.content).toContain('title="Vacation Policy"');
  });

  it("reports totalTokens in done event from stream usage", async () => {
    const events = await collectEvents(makeQuery(), makeSession());

    const doneEvt = events.find((e) => e.type === "done");
    expect(doneEvt).toBeDefined();
    if (doneEvt?.type === "done") {
      expect(doneEvt.totalTokens).toBe(120);
    }
  });

  it("quiz mode uses lower temperature (0.3)", async () => {
    await collectEvents(makeQuery(), makeSession({ mode: "quiz" }));

    const callArgs = mockCreateChat.mock.calls[0]!;
    const reqBody = callArgs[2] as { temperature: number };
    expect(reqBody.temperature).toBe(0.3);
  });

  it("guide mode uses temperature 0.5", async () => {
    await collectEvents(makeQuery(), makeSession({ mode: "guide" }));

    const callArgs = mockCreateChat.mock.calls[0]!;
    const reqBody = callArgs[2] as { temperature: number };
    expect(reqBody.temperature).toBe(0.5);
  });
});
