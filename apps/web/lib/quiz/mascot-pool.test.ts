import { describe, expect, it } from "vitest";
import {
  ALL_MASCOTS,
  BASELINE_MASCOTS,
  COMMON_MASCOTS,
  RARE_MASCOTS,
  hashSeed,
  pickCommonMascot,
  pickRareMascot
} from "./mascot-pool.js";

describe("mascot-pool", () => {
  it("baseline + common + rare are disjoint", () => {
    const all = new Set<string>(ALL_MASCOTS);
    expect(all.size).toBe(BASELINE_MASCOTS.length + COMMON_MASCOTS.length + RARE_MASCOTS.length);
  });

  it("hashSeed is deterministic and non-negative", () => {
    expect(hashSeed("foo")).toBe(hashSeed("foo"));
    expect(hashSeed("foo")).not.toBe(hashSeed("bar"));
    expect(hashSeed("anything")).toBeGreaterThanOrEqual(0);
  });

  it("pickCommonMascot returns same result for same seed", () => {
    const a = pickCommonMascot([], "season-1:user-A");
    const b = pickCommonMascot([], "season-1:user-A");
    expect(a).toBe(b);
    expect(COMMON_MASCOTS).toContain(a as (typeof COMMON_MASCOTS)[number]);
  });

  it("pickCommonMascot skips already-owned", () => {
    const owned = COMMON_MASCOTS.slice(0, COMMON_MASCOTS.length - 1);
    const picked = pickCommonMascot(owned, "seed");
    expect(picked).toBe(COMMON_MASCOTS[COMMON_MASCOTS.length - 1]);
  });

  it("pickCommonMascot returns null when all owned", () => {
    expect(pickCommonMascot(COMMON_MASCOTS, "seed")).toBeNull();
  });

  it("pickRareMascot prefers rare, fallback to common", () => {
    expect(RARE_MASCOTS).toContain(pickRareMascot([], "seed-1") as (typeof RARE_MASCOTS)[number]);
    const fallback = pickRareMascot([...RARE_MASCOTS], "seed-2");
    expect(COMMON_MASCOTS).toContain(fallback as (typeof COMMON_MASCOTS)[number]);
  });
});
