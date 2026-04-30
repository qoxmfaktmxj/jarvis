import { describe, expect, it } from "vitest";
import { kstDateKey, seededShuffle } from "./seeded-shuffle.js";

describe("seededShuffle", () => {
  it("is deterministic for same seed", () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const a = seededShuffle(items, "seed-X");
    const b = seededShuffle(items, "seed-X");
    expect(a).toEqual(b);
  });

  it("differs for different seed", () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const a = seededShuffle(items, "seed-1");
    const b = seededShuffle(items, "seed-2");
    expect(a).not.toEqual(b);
  });

  it("preserves contents (permutation only)", () => {
    const items = ["a", "b", "c", "d"];
    const shuffled = seededShuffle(items, "any");
    expect([...shuffled].sort()).toEqual([...items].sort());
  });

  it("does not mutate input", () => {
    const items = [1, 2, 3];
    const copy = [...items];
    seededShuffle(items, "x");
    expect(items).toEqual(copy);
  });
});

describe("kstDateKey", () => {
  it("rolls forward 9 hours from UTC", () => {
    // 2026-01-01 00:00 UTC == 2026-01-01 09:00 KST
    const d = new Date(Date.UTC(2026, 0, 1, 0, 0, 0));
    expect(kstDateKey(d)).toBe("2026-01-01");
  });

  it("KST midnight crossing: 15:00 UTC = next day 00:00 KST", () => {
    const d = new Date(Date.UTC(2026, 3, 30, 15, 0, 0));
    expect(kstDateKey(d)).toBe("2026-05-01");
  });

  it("KST late evening: 14:59 UTC = same day 23:59 KST", () => {
    const d = new Date(Date.UTC(2026, 3, 30, 14, 59, 0));
    expect(kstDateKey(d)).toBe("2026-04-30");
  });
});
