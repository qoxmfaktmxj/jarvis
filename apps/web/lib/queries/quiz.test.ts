import { describe, expect, it } from "vitest";
import { pickDailyChunk } from "./quiz.js";
import type { QuizDifficulty } from "@jarvis/shared/validation/quiz";

function mk(id: string, difficulty: QuizDifficulty) {
  return {
    id,
    question: `q-${id}`,
    options: ["a", "b", "c", "d"],
    difficulty,
    sourcePagePath: "wiki/p.md"
  };
}

describe("pickDailyChunk", () => {
  const userId = "00000000-0000-0000-0000-000000000001";
  const dayA = new Date(Date.UTC(2026, 4, 1, 5, 0, 0));
  const dayB = new Date(Date.UTC(2026, 4, 2, 5, 0, 0));

  it("returns at most 5 questions", () => {
    const pool = [
      ...Array.from({ length: 8 }, (_, i) => mk(`e${i}`, "easy")),
      ...Array.from({ length: 8 }, (_, i) => mk(`m${i}`, "medium")),
      ...Array.from({ length: 8 }, (_, i) => mk(`h${i}`, "hard"))
    ];
    const picked = pickDailyChunk(pool, userId, dayA);
    expect(picked).toHaveLength(5);
  });

  it("respects difficulty balance (easy 2 / medium 2 / hard 1) when pool is sufficient", () => {
    const pool = [
      ...Array.from({ length: 8 }, (_, i) => mk(`e${i}`, "easy")),
      ...Array.from({ length: 8 }, (_, i) => mk(`m${i}`, "medium")),
      ...Array.from({ length: 8 }, (_, i) => mk(`h${i}`, "hard"))
    ];
    const picked = pickDailyChunk(pool, userId, dayA);
    const counts = picked.reduce(
      (acc, q) => {
        acc[q.difficulty] += 1;
        return acc;
      },
      { easy: 0, medium: 0, hard: 0 } as Record<QuizDifficulty, number>
    );
    expect(counts).toEqual({ easy: 2, medium: 2, hard: 1 });
  });

  it("is deterministic per (userId, KST date)", () => {
    const pool = Array.from({ length: 30 }, (_, i) =>
      mk(`q${i}`, (["easy", "medium", "hard"] as const)[i % 3]!)
    );
    const a = pickDailyChunk(pool, userId, dayA);
    const b = pickDailyChunk(pool, userId, dayA);
    expect(a.map((q) => q.id)).toEqual(b.map((q) => q.id));
  });

  it("changes across days", () => {
    const pool = Array.from({ length: 30 }, (_, i) =>
      mk(`q${i}`, (["easy", "medium", "hard"] as const)[i % 3]!)
    );
    const a = pickDailyChunk(pool, userId, dayA);
    const b = pickDailyChunk(pool, userId, dayB);
    expect(a.map((q) => q.id)).not.toEqual(b.map((q) => q.id));
  });

  it("falls back to whatever is available when pool is small", () => {
    const pool = [mk("e1", "easy"), mk("h1", "hard")];
    const picked = pickDailyChunk(pool, userId, dayA);
    expect(picked).toHaveLength(2);
  });

  it("returns empty for empty pool", () => {
    expect(pickDailyChunk([], userId, dayA)).toEqual([]);
  });

  it("fills remaining slots from any difficulty when balance can't be met", () => {
    // 5 easy + 0 medium + 0 hard → fills all 5 from easy
    const pool = Array.from({ length: 5 }, (_, i) => mk(`e${i}`, "easy"));
    const picked = pickDailyChunk(pool, userId, dayA);
    expect(picked).toHaveLength(5);
    expect(picked.every((q) => q.difficulty === "easy")).toBe(true);
  });
});
