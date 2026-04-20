/**
 * packages/ai/__tests__/page-first-llm-integration.test.ts
 *
 * E2E integration test for LLM shortlist path.
 * Mocked DB + LLM으로 pageFirstAsk의 LLM shortlist 경로 전체를 검증.
 *
 * Scenarios:
 *  1. LLM shortlist succeeds → route.shortlistVia='llm', legacyLexicalShortlist 미호출
 *  2. selectPages fallback=true → legacyLexicalShortlist 경유, route.shortlistVia='legacy'
 */

import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

// OpenAI SDK 생성자가 키 없으면 throw → 더미 키 선설정
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "test-key";

// ── Mock chain ─────────────────────────────────────────────────────────────
vi.mock("@jarvis/db/client", () => ({
  db: {
    execute: vi.fn(),
    insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) })),
  },
}));

vi.mock("../page-first/catalog.js", () => ({ getCatalog: vi.fn() }));
vi.mock("../page-first/domain-infer.js", () => ({ inferDomain: vi.fn() }));
vi.mock("../page-first/llm-shortlist.js", () => ({ selectPages: vi.fn() }));
vi.mock("../page-first/shortlist.js", () => ({
  legacyLexicalShortlist: vi.fn(),
}));
vi.mock("../page-first/read-pages.js", () => ({ readTopPages: vi.fn() }));
vi.mock("../page-first/infra-routing.js", () => ({
  detectInfraIntent: vi.fn(() => false),
}));

vi.mock("../page-first/synthesize.js", () => ({
  synthesizePageFirstAnswer: vi.fn(
    () =>
      (async function* () {
        yield { type: "content" as const, chunk: "answer" };
        yield { type: "done" as const, totalTokens: 100 };
      })(),
  ),
  PAGE_FIRST_PROMPT_VERSION: "v1",
  PAGE_FIRST_SYNTH_OP: "page-first-synth",
}));

vi.mock("../budget.js", () => ({
  assertBudget: vi.fn().mockResolvedValue(undefined),
  BudgetExceededError: class extends Error {},
  recordBlocked: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../cache.js", () => ({
  makeCacheKey: vi.fn(() => "test-key"),
  getCached: vi.fn().mockResolvedValue(null),
  setCached: vi.fn().mockResolvedValue(undefined),
  __resetCacheForTests: vi.fn(),
}));

vi.mock("../logger.js", () => ({
  logLlmCall: vi.fn().mockResolvedValue(undefined),
  logger: { info: vi.fn(), error: vi.fn(), child: vi.fn() },
  withRequestId: vi.fn(),
}));

// ── Imports (after mocks) ──────────────────────────────────────────────────
import { pageFirstAsk } from "../page-first/index.js";
import { getCatalog } from "../page-first/catalog.js";
import { inferDomain } from "../page-first/domain-infer.js";
import { selectPages } from "../page-first/llm-shortlist.js";
import { legacyLexicalShortlist } from "../page-first/shortlist.js";
import { readTopPages } from "../page-first/read-pages.js";
import { getCached } from "../cache.js";

// ── Fixture data ───────────────────────────────────────────────────────────
const mockCatalogRow = {
  path: "manual/policies/leave-vacation",
  title: "휴가 규정",
  slug: "leave-vacation",
  aliases: ["휴가", "빙부상"],
  tags: ["domain/hr"],
  snippet: "근속 연차",
  updatedAt: new Date(),
};

const mockReadResult = {
  ok: true as const,
  pages: [
    {
      id: "p1",
      slug: "leave-vacation",
      path: "manual/policies/leave-vacation",
      title: "휴가 규정",
      body: "...",
      sensitivity: "INTERNAL",
    },
  ],
};

// ── Test suite ─────────────────────────────────────────────────────────────
describe("pageFirstAsk with FEATURE_LLM_SHORTLIST=true", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.FEATURE_LLM_SHORTLIST = "true";

    vi.mocked(inferDomain).mockReturnValue("policies");
    vi.mocked(getCatalog).mockResolvedValue([mockCatalogRow] as never);
    vi.mocked(readTopPages).mockResolvedValue(mockReadResult as never);
    // cache miss 유지
    vi.mocked(getCached).mockResolvedValue(null);
  });

  afterAll(() => {
    delete process.env.FEATURE_LLM_SHORTLIST;
  });

  it("emits route event with shortlistVia='llm' when LLM shortlist succeeds", async () => {
    vi.mocked(selectPages).mockResolvedValue({
      pages: ["leave-vacation"],
      reasoning: "명확한 휴가 규정 페이지",
      fallback: false,
      hallucinationCount: 0,
      via: "gateway",
    } as never);

    const events: unknown[] = [];
    for await (const e of pageFirstAsk({
      question: "빙부상 휴가?",
      workspaceId: "ws-1",
      userPermissions: ["knowledge:read"],
    } as never)) {
      events.push(e);
    }

    const routeEvt = events.find((e: any) => e.type === "route") as any;
    expect(routeEvt).toBeDefined();
    expect(routeEvt.shortlistVia).toBe("llm");
    expect(routeEvt.lane).toBe("wiki.page-first");
    expect(vi.mocked(legacyLexicalShortlist)).not.toHaveBeenCalled();
  });

  it("falls back to legacy when selectPages returns fallback=true", async () => {
    vi.mocked(selectPages).mockResolvedValue({
      pages: [],
      reasoning: "all hallucinated",
      fallback: true,
      hallucinationCount: 3,
      via: "fallback",
    } as never);

    vi.mocked(legacyLexicalShortlist).mockResolvedValue([
      {
        id: "p1",
        slug: "leave-vacation",
        path: "manual/policies/leave-vacation",
        title: "휴가 규정",
        sensitivity: "INTERNAL",
        requiredPermission: null,
        score: 10,
      },
    ] as never);

    const events: unknown[] = [];
    for await (const e of pageFirstAsk({
      question: "빙부상 휴가?",
      workspaceId: "ws-1",
      userPermissions: ["knowledge:read"],
    } as never)) {
      events.push(e);
    }

    const routeEvt = events.find((e: any) => e.type === "route") as any;
    expect(routeEvt).toBeDefined();
    expect(routeEvt.shortlistVia).toBe("legacy");
    expect(vi.mocked(legacyLexicalShortlist)).toHaveBeenCalled();
  });
});
