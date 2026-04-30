import { describe, expect, it } from "vitest";
import {
  assignDifficulty,
  buildQuizPrompt,
  sampleBalancedPages
} from "./wiki-quiz-generate.js";

function mkPage(id: string, type: string) {
  return {
    id,
    workspaceId: "ws-1",
    path: `wiki/ws/${id}.md`,
    title: `Page ${id}`,
    type,
    sensitivity: "INTERNAL"
  };
}

describe("sampleBalancedPages", () => {
  it("returns all when pool is smaller than target", () => {
    const pool = [mkPage("a", "concept"), mkPage("b", "entity")];
    expect(sampleBalancedPages(pool, 30)).toHaveLength(2);
  });

  it("samples target count from balanced types", () => {
    const pool = [
      ...Array.from({ length: 10 }, (_, i) => mkPage(`c${i}`, "concept")),
      ...Array.from({ length: 10 }, (_, i) => mkPage(`e${i}`, "entity")),
      ...Array.from({ length: 10 }, (_, i) => mkPage(`p${i}`, "playbook"))
    ];
    const sampled = sampleBalancedPages(pool, 9);
    expect(sampled).toHaveLength(9);
    const types = sampled.map((p) => p.type);
    // round-robin produces ~3 of each type
    expect(types.filter((t) => t === "concept").length).toBeGreaterThanOrEqual(2);
    expect(types.filter((t) => t === "entity").length).toBeGreaterThanOrEqual(2);
    expect(types.filter((t) => t === "playbook").length).toBeGreaterThanOrEqual(2);
  });

  it("does not duplicate pages", () => {
    const pool = Array.from({ length: 30 }, (_, i) =>
      mkPage(`p${i}`, ["concept", "entity"][i % 2]!)
    );
    const sampled = sampleBalancedPages(pool, 15);
    const ids = new Set(sampled.map((p) => p.id));
    expect(ids.size).toBe(sampled.length);
  });
});

describe("assignDifficulty", () => {
  it("distributes 30 pages to easy 9 / medium 15 / hard 6", () => {
    const pages = Array.from({ length: 30 }, (_, i) => mkPage(`p${i}`, "concept"));
    const out = assignDifficulty(pages);
    const counts = out.reduce(
      (acc, x) => {
        acc[x.difficulty] += 1;
        return acc;
      },
      { easy: 0, medium: 0, hard: 0 }
    );
    expect(counts).toEqual({ easy: 9, medium: 15, hard: 6 });
  });

  it("trims when fewer pages provided", () => {
    const pages = Array.from({ length: 5 }, (_, i) => mkPage(`p${i}`, "concept"));
    const out = assignDifficulty(pages);
    expect(out).toHaveLength(5);
    expect(out.every((x) => x.difficulty === "easy")).toBe(true);
  });
});

describe("buildQuizPrompt", () => {
  it("includes title, difficulty hint, and JSON schema in user message", () => {
    const { system, user } = buildQuizPrompt({
      pageTitle: "Vacation Policy",
      pagePath: "wiki/ws/policies/vacation.md",
      pageBody: "직원은 연 15일 연차를 사용할 수 있다.",
      difficulty: "medium"
    });
    expect(system).toContain("JSON으로만");
    expect(user).toContain("Vacation Policy");
    expect(user).toContain("medium");
    expect(user).toContain("answerIndex");
    expect(user).toContain("연차");
  });

  it("truncates very long body", () => {
    const longBody = "가".repeat(10_000);
    const { user } = buildQuizPrompt({
      pageTitle: "T",
      pagePath: "p",
      pageBody: longBody,
      difficulty: "easy"
    });
    expect(user.length).toBeLessThan(longBody.length);
    expect(user).toContain("(생략)");
  });
});
