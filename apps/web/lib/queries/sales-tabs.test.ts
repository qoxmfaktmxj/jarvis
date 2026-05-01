import { describe, it, expect } from "vitest";
import { buildMemoTree, getCustomerTabCounts, getContactTabCounts } from "./sales-tabs";

describe("buildMemoTree", () => {
  const flatRows = [
    { comtSeq: 1, priorComtSeq: 0, memo: "first master",  authorName: "alice", insdate: "2026-05-01 10:00", createdBy: "u1" },
    { comtSeq: 2, priorComtSeq: 1, memo: "reply to 1",    authorName: "bob",   insdate: "2026-05-01 10:05", createdBy: "u2" },
    { comtSeq: 3, priorComtSeq: 0, memo: "second master", authorName: "alice", insdate: "2026-05-01 11:00", createdBy: "u1" },
    { comtSeq: 4, priorComtSeq: 1, memo: "another reply", authorName: "alice", insdate: "2026-05-01 11:30", createdBy: "u1" },
  ];

  it("groups masters at top level (priorComtSeq=0)", () => {
    const tree = buildMemoTree(flatRows, "u1");
    expect(tree).toHaveLength(2);
    expect(tree[0]!.comtSeq).toBe(1);
    expect(tree[1]!.comtSeq).toBe(3);
  });

  it("attaches replies under their master", () => {
    const tree = buildMemoTree(flatRows, "u1");
    expect(tree[0]!.replies).toHaveLength(2);
    expect(tree[0]!.replies[0]!.comtSeq).toBe(2);
    expect(tree[0]!.replies[1]!.comtSeq).toBe(4);
    expect(tree[1]!.replies).toHaveLength(0);
  });

  it("flags isOwn correctly per row based on session userId", () => {
    const tree = buildMemoTree(flatRows, "u1");
    expect(tree[0]!.isOwn).toBe(true);
    expect(tree[0]!.replies[0]!.isOwn).toBe(false);
    expect(tree[0]!.replies[1]!.isOwn).toBe(true);
    expect(tree[1]!.isOwn).toBe(true);
  });

  it("orphan reply (priorComtSeq points to non-existent master) is silently dropped", () => {
    const orphan = [
      { comtSeq: 1, priorComtSeq: 99, memo: "orphan", authorName: "x", insdate: "2026-05-01", createdBy: "u9" },
    ];
    expect(buildMemoTree(orphan, "u1")).toEqual([]);
  });
});

// Count helpers hit a real DB. Skip when no DATABASE_URL (local dev w/o Postgres).
// CI sets DATABASE_URL; e2e (Task 9) covers the live-DB path end-to-end.
const HAS_DB = !!process.env.DATABASE_URL;

describe.skipIf(!HAS_DB)("getCustomerTabCounts (P2-BLOCKED, DB-required)", () => {
  it("returns 0 for opCnt and actCnt while P2 schema is not yet merged", async () => {
    // No DB fixture — this test verifies the P2-BLOCKED contract: op/act always 0
    // until the P2 schema is wired up. Real customer/comt counts require DB setup,
    // covered by e2e tests (Task 9).
    const counts = await getCustomerTabCounts("00000000-0000-0000-0000-000000000000", "11111111-1111-1111-1111-111111111111");
    expect(counts.opCnt).toBe(0);
    expect(counts.actCnt).toBe(0);
    expect(typeof counts.customerCnt).toBe("number");
    expect(typeof counts.comtCnt).toBe("number");
  });
});

describe.skipIf(!HAS_DB)("getContactTabCounts (P2-BLOCKED, DB-required)", () => {
  it("returns 0 for opCnt and actCnt; custCompanyCnt is 0 or 1", async () => {
    const counts = await getContactTabCounts("00000000-0000-0000-0000-000000000000", "22222222-2222-2222-2222-222222222222");
    expect(counts.opCnt).toBe(0);
    expect(counts.actCnt).toBe(0);
    expect([0, 1]).toContain(counts.custCompanyCnt);
    expect(typeof counts.comtCnt).toBe("number");
  });
});
