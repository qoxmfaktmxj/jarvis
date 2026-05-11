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

// 2026-05-11 (A2 P0-1): opCnt / actCnt are live (sales_opportunity / sales_activity
// schemas are merged). With no fixture rows for the synthetic UUIDs the test
// uses, all 4 count values are expected to be 0 — but the shape contract is
// what's verified here (numeric, never undefined).
describe.skipIf(!HAS_DB)("getCustomerTabCounts (DB-required)", () => {
  it("returns numeric counts for all 4 tabs (customerCnt/opCnt/actCnt/comtCnt)", async () => {
    const counts = await getCustomerTabCounts("00000000-0000-0000-0000-000000000000", "11111111-1111-1111-1111-111111111111");
    expect(typeof counts.customerCnt).toBe("number");
    expect(typeof counts.opCnt).toBe("number");
    expect(typeof counts.actCnt).toBe("number");
    expect(typeof counts.comtCnt).toBe("number");
  });
});

describe.skipIf(!HAS_DB)("getContactTabCounts (DB-required)", () => {
  it("returns numeric counts and custCompanyCnt is 0 or 1", async () => {
    const counts = await getContactTabCounts("00000000-0000-0000-0000-000000000000", "22222222-2222-2222-2222-222222222222");
    expect(typeof counts.opCnt).toBe("number");
    expect(typeof counts.actCnt).toBe("number");
    expect([0, 1]).toContain(counts.custCompanyCnt);
    expect(typeof counts.comtCnt).toBe("number");
  });
});
