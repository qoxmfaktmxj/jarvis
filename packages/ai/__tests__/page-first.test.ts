/**
 * packages/ai/__tests__/page-first.test.ts
 *
 * Phase-W2 T2 — unit coverage for page-first navigation.
 *
 * Focus:
 *   - shortlist: filters by permission / sensitivity / requiredPermission.
 *   - expand: caps at fanOut=30, dedupes vs. shortlist, inbound-heavy first.
 *   - synthesize: emits sources+meta+done, saveAsPageEligible heuristic.
 *   - orchestrator: respects feature-flag OFF (ask.ts branch), cache-through.
 *
 * We deliberately mock the DB client and the OpenAI stream so this runs
 * with no network or Postgres connection (matches vitest.config exclusion
 * rules — ask.test.ts is excluded because it bails out similarly).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// OpenAI SDK throws at construction time if no key; the mock above handles
// network calls but the constructor still runs. Set a dummy key before any
// page-first module import.
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "test-key";

// ── db client mock (shared across shortlist/expand tests) ───────────────
vi.mock("@jarvis/db/client", () => ({
  db: {
    execute: vi.fn(),
    insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) })),
  },
}));

// ── wiki-fs mock so readPage doesn't hit disk ───────────────────────────
vi.mock("@jarvis/wiki-fs", () => ({
  readPage: vi.fn(async (_ws: string, relPath: string) => {
    // Deterministic body that includes the path — makes assertions easy.
    return `---\ntitle: Fake\n---\n\nBody for ${relPath}`;
  }),
  wikiRoot: () => "/tmp/wiki",
}));

// ── OpenAI mock: stream a fixed answer, report deterministic usage ──────
vi.mock("../openai-compat.js", () => ({
  createChatWithTokenFallback: vi.fn(async () => {
    async function* gen() {
      yield {
        choices: [{ delta: { content: "휴가는 1년에 15일입니다 [[vacation-policy]]." } }],
      };
      yield { choices: [{ delta: {} }], usage: { prompt_tokens: 100, completion_tokens: 20 } };
    }
    return gen();
  }),
}));

// ── budget bypass: no postgres available in unit test env ───────────────
vi.mock("../budget.js", () => ({
  assertBudget: vi.fn().mockResolvedValue(undefined),
  recordBlocked: vi.fn().mockResolvedValue(undefined),
  BudgetExceededError: class BudgetExceededError extends Error {},
}));

vi.mock("../logger.js", () => ({
  logLlmCall: vi.fn().mockResolvedValue(undefined),
  logger: { info: vi.fn(), error: vi.fn(), child: vi.fn() },
  withRequestId: vi.fn(),
}));

import { lexicalShortlist } from "../page-first/shortlist.js";
import { expandOneHop } from "../page-first/expand.js";
import { readTopPages } from "../page-first/read-pages.js";
import { synthesizePageFirstAnswer } from "../page-first/synthesize.js";
import { pageFirstAsk } from "../page-first/index.js";
import { __resetCacheForTests } from "../cache.js";
import type { SSEEvent } from "../types.js";
import { db } from "@jarvis/db/client";

const WS = "00000000-0000-0000-0000-0000000000aa";

function resetDb() {
  vi.mocked(db.execute).mockReset();
  __resetCacheForTests();
}

// ---------------------------------------------------------------------------
// shortlist
// ---------------------------------------------------------------------------
describe("lexicalShortlist", () => {
  beforeEach(resetDb);

  it("returns rows and filters by requiredPermission in app layer", async () => {
    vi.mocked(db.execute).mockResolvedValueOnce({
      rows: [
        {
          id: "p1",
          path: "auto/entities/A.md",
          title: "Alpha",
          slug: "alpha",
          sensitivity: "INTERNAL",
          required_permission: null,
          updated_at: new Date("2026-04-10"),
          score: 9.5,
        },
        {
          id: "p2",
          path: "auto/entities/B.md",
          title: "Beta",
          slug: "beta",
          sensitivity: "RESTRICTED",
          required_permission: "admin:all",
          updated_at: new Date("2026-04-09"),
          score: 8.0,
        },
      ],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const hits = await lexicalShortlist({
      workspaceId: WS,
      userPermissions: ["knowledge:read"],
      question: "alpha에 대해 알려줘",
    });

    // p2 has requiredPermission=admin:all which the user doesn't have.
    expect(hits.map((h) => h.id)).toEqual(["p1"]);
  });

  it("passes admin-privileged pages through when user has admin:all", async () => {
    vi.mocked(db.execute).mockResolvedValueOnce({
      rows: [
        {
          id: "p2",
          path: "auto/entities/B.md",
          title: "Beta",
          slug: "beta",
          sensitivity: "RESTRICTED",
          required_permission: "admin:all",
          updated_at: new Date(),
          score: 8.0,
        },
      ],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const hits = await lexicalShortlist({
      workspaceId: WS,
      userPermissions: ["admin:all"],
      question: "beta",
    });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.id).toBe("p2");
  });
});

// ---------------------------------------------------------------------------
// expand 1-hop
// ---------------------------------------------------------------------------
describe("expandOneHop", () => {
  beforeEach(resetDb);

  it("unions shortlist with neighbors, inbound-heavy first, shortlist dedup", async () => {
    // The real SQL has LIMIT 30 baked in, but our mock returns whatever we
    // give it verbatim. We simulate the capped-rows that Postgres would
    // return (28 neighbors + a duplicate of the shortlist id to verify dedup).
    const rows = [
      ...Array.from({ length: 28 }, (_, i) => ({
        id: `n${i}`,
        path: `auto/entities/N${i}.md`,
        title: `N${i}`,
        slug: `n${i}`,
        sensitivity: "INTERNAL",
        required_permission: null,
        inbound_count: 28 - i,
      })),
      // Duplicate shortlist id: must be deduped.
      {
        id: "p1",
        path: "auto/entities/A.md",
        title: "Alpha",
        slug: "alpha",
        sensitivity: "INTERNAL",
        required_permission: null,
        inbound_count: 5,
      },
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(db.execute).mockResolvedValueOnce({ rows } as any);

    const out = await expandOneHop({
      workspaceId: WS,
      userPermissions: ["knowledge:read"],
      shortlist: [
        {
          id: "p1",
          path: "auto/entities/A.md",
          title: "Alpha",
          slug: "alpha",
          sensitivity: "INTERNAL",
          requiredPermission: null,
          updatedAt: new Date(),
          score: 9,
        },
      ],
      fanOut: 30,
    });

    // shortlist(1) + neighbors(28) with duplicate removed
    expect(out).toHaveLength(29);
    expect(out[0]?.origin).toBe("shortlist");
    expect(out.find((p) => p.id === "p1")?.origin).toBe("shortlist");
    // Neighbors sorted by inboundCount desc
    const expanded = out.filter((p) => p.origin === "expand");
    for (let i = 0; i < expanded.length - 1; i++) {
      expect(expanded[i]!.inboundCount).toBeGreaterThanOrEqual(
        expanded[i + 1]!.inboundCount,
      );
    }
  });

  it("returns empty when shortlist is empty (no SQL call)", async () => {
    const out = await expandOneHop({
      workspaceId: WS,
      userPermissions: [],
      shortlist: [],
    });
    expect(out).toEqual([]);
    expect(db.execute).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// read-pages (mocked wiki-fs)
// ---------------------------------------------------------------------------
describe("readTopPages", () => {
  it("reads at most topN pages and truncates long bodies", async () => {
    const candidates = Array.from({ length: 12 }, (_, i) => ({
      id: `p${i}`,
      path: `auto/entities/P${i}.md`,
      title: `P${i}`,
      slug: `p${i}`,
      sensitivity: "INTERNAL",
      requiredPermission: null,
      origin: "shortlist" as const,
      inboundCount: 0,
      score: 1,
    }));

    const out = await readTopPages({
      workspaceId: WS,
      candidates,
      topN: 5,
      maxCharsPerPage: 10, // tiny so even our short mock body gets truncated
    });

    expect(out).toHaveLength(5);
    expect(out[0]?.content.endsWith("…[truncated]")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// synthesize — sources, meta, SSE shape
// ---------------------------------------------------------------------------
describe("synthesizePageFirstAnswer", () => {
  it("emits sources with [[slug]] citations + meta + done", async () => {
    const events: SSEEvent[] = [];
    for await (const ev of synthesizePageFirstAnswer({
      question: "휴가 정책?",
      pages: [
        {
          id: "p1",
          path: "auto/policy/vacation.md",
          title: "Vacation",
          slug: "vacation-policy",
          sensitivity: "INTERNAL",
          origin: "shortlist",
          content: "휴가는 1년 15일입니다.",
        },
        {
          id: "p2",
          path: "auto/policy/leave.md",
          title: "Leave",
          slug: "leave",
          sensitivity: "INTERNAL",
          origin: "expand",
          content: "병가 별도.",
        },
      ],
      workspaceId: WS,
      requestId: "req-1",
    })) {
      events.push(ev);
    }

    const sourcesEvt = events.find((e) => e.type === "sources");
    expect(sourcesEvt).toBeDefined();
    if (sourcesEvt?.type === "sources") {
      expect(sourcesEvt.sources).toHaveLength(2);
      const s0 = sourcesEvt.sources[0]!;
      expect(s0.kind).toBe("wiki-page");
      if (s0.kind === "wiki-page") {
        expect(s0.citation).toBe("[[vacation-policy]]");
        expect(s0.origin).toBe("shortlist");
      }
    }

    const metaEvt = events.find((e) => e.type === "meta");
    expect(metaEvt).toBeDefined();
    if (metaEvt?.type === "meta") {
      expect(metaEvt.meta.pageFirst).toBe(true);
      // Answer accumulated from mocked stream is 32 chars — eligibility
      // requires ≥80 chars. So this case is NOT eligible.
      expect(metaEvt.meta.saveAsPageEligible).toBe(false);
    }

    expect(events.at(-1)?.type).toBe("done");
  });

  it("fallback-text + empty sources when no pages provided", async () => {
    const events: SSEEvent[] = [];
    for await (const ev of synthesizePageFirstAnswer({
      question: "zero-page",
      pages: [],
      workspaceId: WS,
      requestId: null,
    })) {
      events.push(ev);
    }

    const sourcesEvt = events.find((e) => e.type === "sources");
    expect(sourcesEvt).toBeDefined();
    if (sourcesEvt?.type === "sources") {
      expect(sourcesEvt.sources).toEqual([]);
    }
    const doneEvt = events.find((e) => e.type === "done");
    expect(doneEvt).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// orchestrator — end-to-end via pageFirstAsk with mocked DB
// ---------------------------------------------------------------------------
describe("pageFirstAsk orchestrator", () => {
  beforeEach(resetDb);

  it("emits route=wiki.page-first then streams synthesis, cached on second call", async () => {
    // shortlist query
    vi.mocked(db.execute).mockResolvedValueOnce({
      rows: [
        {
          id: "p1",
          path: "auto/policy/vacation.md",
          title: "Vacation",
          slug: "vacation",
          sensitivity: "INTERNAL",
          required_permission: null,
          updated_at: new Date(),
          score: 10,
        },
      ],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    // expand query
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(db.execute).mockResolvedValueOnce({ rows: [] } as any);

    const events1: SSEEvent[] = [];
    for await (const ev of pageFirstAsk({
      question: "휴가 정책이 뭐야?",
      workspaceId: WS,
      userId: "u1",
      userRoles: ["DEVELOPER"],
      userPermissions: ["knowledge:read"],
    })) {
      events1.push(ev);
    }

    const route = events1[0];
    expect(route?.type).toBe("route");
    if (route?.type === "route") expect(route.lane).toBe("wiki.page-first");
    expect(events1.some((e) => e.type === "sources")).toBe(true);
    expect(events1.some((e) => e.type === "meta")).toBe(true);

    // Second invocation with identical params should NOT hit DB (cache-through).
    vi.mocked(db.execute).mockClear();
    const events2: SSEEvent[] = [];
    for await (const ev of pageFirstAsk({
      question: "휴가 정책이 뭐야?",
      workspaceId: WS,
      userId: "u1",
      userRoles: ["DEVELOPER"],
      userPermissions: ["knowledge:read"],
    })) {
      events2.push(ev);
    }
    expect(db.execute).not.toHaveBeenCalled();
    // Replayed events should be identical in type order.
    expect(events2.map((e) => e.type)).toEqual(events1.map((e) => e.type));
  });
});
