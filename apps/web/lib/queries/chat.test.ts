import { describe, expect, it } from "vitest";
import { aggregateReactions } from "./chat.js";

describe("aggregateReactions", () => {
  it("counts per emoji + marks mine", () => {
    const rows = [
      { messageId: "m1", userId: "u1", emoji: "👍" as const },
      { messageId: "m1", userId: "u2", emoji: "👍" as const },
      { messageId: "m1", userId: "u1", emoji: "❤️" as const },
      { messageId: "m2", userId: "u3", emoji: "🎉" as const }
    ];
    const map = aggregateReactions(rows, "u1");
    expect(map.get("m1")).toEqual([
      { emoji: "👍", count: 2, mine: true },
      { emoji: "❤️", count: 1, mine: true }
    ]);
    expect(map.get("m2")).toEqual([
      { emoji: "🎉", count: 1, mine: false }
    ]);
  });
  it("respects emoji ordering (whitelist order)", () => {
    const rows = [
      { messageId: "m1", userId: "u1", emoji: "🙏" as const },
      { messageId: "m1", userId: "u2", emoji: "👍" as const }
    ];
    const map = aggregateReactions(rows, "u2");
    expect(map.get("m1")!.map((r) => r.emoji)).toEqual(["👍", "🙏"]);
  });
});
