import { describe, it, expect, vi, beforeEach } from "vitest";
import { selectPages } from "../llm-shortlist.js";
import type { CatalogRow } from "../catalog.js";

const mockCatalog: CatalogRow[] = [
  {
    path: "manual/policies/leave-vacation",
    title: "휴가 규정",
    slug: "leave-vacation",
    aliases: ["휴가","빙부상","경조사"],
    tags: ["domain/hr"],
    snippet: "근속 연차 경조사",
    updatedAt: new Date("2026-04-01"),
  },
  {
    path: "manual/procedures/leave-application-forms",
    title: "휴가 신청서",
    slug: "leave-application-forms",
    aliases: ["휴가신청"],
    tags: [],
    snippet: "신청 방법",
    updatedAt: new Date("2026-04-01"),
  },
];

const createMock = vi.fn();
vi.mock("../../provider.js", () => ({
  getProvider: vi.fn(() => ({
    client: { chat: { completions: { create: createMock } } },
    via: "gateway" as const,
  })),
  resolveModel: vi.fn(() => "gpt-5.4-mini"),
}));

describe("selectPages", () => {
  beforeEach(() => { createMock.mockReset(); });

  it("returns validated slugs from valid JSON", async () => {
    createMock.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify({ pages: ["leave-vacation","leave-application-forms"], reasoning: "빙부상 경조사" }) } }],
    });
    const r = await selectPages({ question: "빙부상?", catalog: mockCatalog });
    expect(r.pages).toEqual(["leave-vacation","leave-application-forms"]);
    expect(r.fallback).toBe(false);
    expect(r.hallucinationCount).toBe(0);
    expect(r.via).toBe("gateway");
  });

  it("filters hallucinated slugs not in catalog", async () => {
    createMock.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify({ pages: ["leave-vacation","nonexistent","leave-application-forms","another-fake"], reasoning: "x" }) } }],
    });
    const r = await selectPages({ question: "?", catalog: mockCatalog });
    expect(r.pages).toEqual(["leave-vacation","leave-application-forms"]);
    expect(r.hallucinationCount).toBe(2);
    expect(r.fallback).toBe(false);
  });

  it("sets fallback=true when filtered < 2", async () => {
    createMock.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify({ pages: ["fake1","fake2"], reasoning: "allfake" }) } }],
    });
    const r = await selectPages({ question: "?", catalog: mockCatalog });
    expect(r.fallback).toBe(true);
  });

  it("sets fallback=true on JSON parse fail", async () => {
    createMock.mockResolvedValueOnce({ choices: [{ message: { content: "not json" } }] });
    const r = await selectPages({ question: "?", catalog: mockCatalog });
    expect(r.fallback).toBe(true);
    expect(r.via).toBe("fallback");
  });

  it("sets fallback=true on LLM error", async () => {
    createMock.mockRejectedValueOnce(new Error("network"));
    const r = await selectPages({ question: "?", catalog: mockCatalog });
    expect(r.fallback).toBe(true);
  });
});
