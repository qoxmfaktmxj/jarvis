/**
 * packages/ai/__tests__/page-first-expand.test.ts
 *
 * X2 — packages/ai page-first 단위 테스트 보강 (expand).
 *
 * 목표:
 *   - fanOut=30 cap (spec-mandated).
 *   - 이웃(neighbor) inboundCount 내림차순 정렬 (hub 우선).
 *   - shortlist 와 중복되는 neighbor 는 dedupe.
 *   - 빈 wikilinks(shortlist=[]) 는 SQL 호출 없이 빈 배열.
 *   - requiredPermission 가진 neighbor 는 권한 없으면 제외.
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

import { expandOneHop } from "../page-first/expand.js";
import type { ShortlistHit } from "../page-first/shortlist.js";
import { db } from "@jarvis/db/client";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";

const WS = "00000000-0000-0000-0000-0000000000aa";

function resetDb() {
  vi.mocked(db.execute).mockReset();
}

function makeShortlistHit(id: string, overrides: Partial<ShortlistHit> = {}): ShortlistHit {
  return {
    id,
    path: `auto/entities/${id}.md`,
    title: id.toUpperCase(),
    slug: id,
    sensitivity: "INTERNAL",
    requiredPermission: null,
    updatedAt: new Date("2026-04-10"),
    score: 10,
    ...overrides,
  };
}

describe("expandOneHop — fanOut cap, dedupe, inbound-order, permission", () => {
  beforeEach(resetDb);

  // ---------------------------------------------------------------------
  // 1) 빈 shortlist → SQL 호출 없이 빈 배열
  // ---------------------------------------------------------------------
  it("empty shortlist returns [] without issuing a SQL call", async () => {
    const out = await expandOneHop({
      workspaceId: WS,
      userPermissions: [PERMISSIONS.KNOWLEDGE_READ],
      shortlist: [],
    });
    expect(out).toEqual([]);
    expect(db.execute).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------
  // 2) fanOut=30 cap 확인 — 30 초과 요청해도 내부에서 Math.min 처리
  //    (실제 SQL LIMIT 파라미터 자체가 30 이하여야 한다.)
  // ---------------------------------------------------------------------
  it("caps fanOut at 30 even when caller asks for more", async () => {
    vi.mocked(db.execute).mockResolvedValueOnce({
      rows: [],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    await expandOneHop({
      workspaceId: WS,
      userPermissions: [PERMISSIONS.KNOWLEDGE_READ],
      shortlist: [makeShortlistHit("p1")],
      fanOut: 999, // spec 위반 값 — 내부에서 30 으로 클램프 되어야.
    });

    const passed = vi.mocked(db.execute).mock.calls[0]?.[0];
    const serialized = JSON.stringify(passed);
    // drizzle 은 LIMIT ${fanOut} 파라미터를 SQL 직렬화에 포함시킨다.
    expect(serialized).toContain("30");
    expect(serialized).not.toContain("999");
    expect(serialized).toMatch(/LIMIT/i);
  });

  // ---------------------------------------------------------------------
  // 3) fanOut 기본값(undefined) → 30
  // ---------------------------------------------------------------------
  it("defaults fanOut to 30 when unspecified", async () => {
    vi.mocked(db.execute).mockResolvedValueOnce({
      rows: [],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    await expandOneHop({
      workspaceId: WS,
      userPermissions: [PERMISSIONS.KNOWLEDGE_READ],
      shortlist: [makeShortlistHit("p1")],
    });

    const serialized = JSON.stringify(
      vi.mocked(db.execute).mock.calls[0]?.[0],
    );
    expect(serialized).toContain("30");
  });

  // ---------------------------------------------------------------------
  // 4) shortlist 와 겹치는 neighbor 는 dedupe — shortlist 행만 살아남음
  // ---------------------------------------------------------------------
  it("dedupes neighbors that coincide with shortlist (shortlist origin wins)", async () => {
    // DB 가 p1 을 "neighbor" 로 돌려주지만, p1 은 이미 shortlist 에 있음.
    vi.mocked(db.execute).mockResolvedValueOnce({
      rows: [
        {
          id: "p1",
          path: "auto/entities/p1.md",
          title: "P1",
          slug: "p1",
          sensitivity: "INTERNAL",
          required_permission: null,
          inbound_count: 42,
        },
        {
          id: "n1",
          path: "auto/entities/n1.md",
          title: "N1",
          slug: "n1",
          sensitivity: "INTERNAL",
          required_permission: null,
          inbound_count: 3,
        },
      ],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const out = await expandOneHop({
      workspaceId: WS,
      userPermissions: [PERMISSIONS.KNOWLEDGE_READ],
      shortlist: [makeShortlistHit("p1")],
    });

    const p1Rows = out.filter((p) => p.id === "p1");
    expect(p1Rows).toHaveLength(1);
    expect(p1Rows[0]?.origin).toBe("shortlist");

    // n1 는 expand 로 살아남아야 한다.
    const n1 = out.find((p) => p.id === "n1");
    expect(n1?.origin).toBe("expand");
  });

  // ---------------------------------------------------------------------
  // 5) 이웃 정렬 — inboundCount 내림차순 (hub 우선)
  //    Note: 실제 ORDER BY 는 SQL 에 있고 mock 은 그대로 돌려주므로,
  //    여기서는 "이미 정렬된 rows" 가 그대로 union 에 들어가 순서가
  //    보존되는지를 확인한다.
  // ---------------------------------------------------------------------
  it("preserves inbound-descending order of neighbors after shortlist", async () => {
    const rows = [
      { id: "hub", path: "h.md", title: "Hub", slug: "hub", sensitivity: "INTERNAL", required_permission: null, inbound_count: 100 },
      { id: "mid", path: "m.md", title: "Mid", slug: "mid", sensitivity: "INTERNAL", required_permission: null, inbound_count: 10 },
      { id: "leaf", path: "l.md", title: "Leaf", slug: "leaf", sensitivity: "INTERNAL", required_permission: null, inbound_count: 1 },
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(db.execute).mockResolvedValueOnce({ rows } as any);

    const out = await expandOneHop({
      workspaceId: WS,
      userPermissions: [PERMISSIONS.KNOWLEDGE_READ],
      shortlist: [makeShortlistHit("p1")],
    });

    // shortlist 가 앞, 그 다음 expand (inbound desc).
    expect(out[0]?.id).toBe("p1");
    const expanded = out.filter((p) => p.origin === "expand");
    expect(expanded.map((p) => p.id)).toEqual(["hub", "mid", "leaf"]);
    for (let i = 0; i < expanded.length - 1; i++) {
      expect(expanded[i]!.inboundCount).toBeGreaterThanOrEqual(
        expanded[i + 1]!.inboundCount,
      );
    }
  });

  // ---------------------------------------------------------------------
  // 6) requiredPermission 가진 neighbor 는 권한 없으면 제외
  // ---------------------------------------------------------------------
  it("filters out neighbor rows whose requiredPermission caller lacks", async () => {
    vi.mocked(db.execute).mockResolvedValueOnce({
      rows: [
        {
          id: "n_open",
          path: "open.md",
          title: "Open",
          slug: "open",
          sensitivity: "INTERNAL",
          required_permission: null,
          inbound_count: 5,
        },
        {
          id: "n_locked",
          path: "locked.md",
          title: "Locked",
          slug: "locked",
          sensitivity: "INTERNAL",
          required_permission: "admin:users:read",
          inbound_count: 10,
        },
      ],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const out = await expandOneHop({
      workspaceId: WS,
      userPermissions: [PERMISSIONS.KNOWLEDGE_READ],
      shortlist: [makeShortlistHit("p1")],
    });

    const ids = out.filter((p) => p.origin === "expand").map((p) => p.id);
    expect(ids).toEqual(["n_open"]); // n_locked 는 제외
  });

  // ---------------------------------------------------------------------
  // 7) ADMIN_ALL 은 모든 requiredPermission 통과
  // ---------------------------------------------------------------------
  it("ADMIN_ALL bypasses neighbor requiredPermission filter", async () => {
    vi.mocked(db.execute).mockResolvedValueOnce({
      rows: [
        {
          id: "n_locked",
          path: "l.md",
          title: "L",
          slug: "l",
          sensitivity: "RESTRICTED",
          required_permission: "weird:perm",
          inbound_count: 10,
        },
      ],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const out = await expandOneHop({
      workspaceId: WS,
      userPermissions: [PERMISSIONS.ADMIN_ALL],
      shortlist: [makeShortlistHit("p1")],
    });
    const expanded = out.filter((p) => p.origin === "expand");
    expect(expanded.map((p) => p.id)).toEqual(["n_locked"]);
  });

  // ---------------------------------------------------------------------
  // 8) 결과 shape: ExpandedPage 필드가 모두 채워진다
  // ---------------------------------------------------------------------
  it("returns ExpandedPage shape with origin/inboundCount/score populated", async () => {
    vi.mocked(db.execute).mockResolvedValueOnce({
      rows: [
        {
          id: "n1",
          path: "n1.md",
          title: "N1",
          slug: "n1",
          sensitivity: "PUBLIC",
          required_permission: null,
          inbound_count: 7,
        },
      ],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const out = await expandOneHop({
      workspaceId: WS,
      userPermissions: [PERMISSIONS.KNOWLEDGE_READ],
      shortlist: [makeShortlistHit("p1")],
    });

    const neighbor = out.find((p) => p.id === "n1");
    expect(neighbor).toMatchObject({
      id: "n1",
      path: "n1.md",
      title: "N1",
      slug: "n1",
      sensitivity: "PUBLIC",
      requiredPermission: null,
      origin: "expand",
      inboundCount: 7,
    });
    // score 는 inboundCount/10 heuristic.
    expect(neighbor?.score).toBeCloseTo(0.7, 5);
  });
});
