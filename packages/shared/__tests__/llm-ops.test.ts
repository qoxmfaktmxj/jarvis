// packages/shared/__tests__/llm-ops.test.ts
// Phase-W1 T5 (Track B2): LLM op 상수 및 타입 가드 스모크 테스트.
import { describe, it, expect } from "vitest";
import {
  ALL_OPS,
  CORE_OPS,
  WIKI_OPS,
  isValidOp,
  isWikiOp,
} from "../constants/llm-ops.js";

describe("llm-ops constants", () => {
  it("WIKI_OPS contains exactly 6 operations", () => {
    expect(WIKI_OPS).toHaveLength(6);
  });

  it("WIKI_OPS contains all six named wiki op strings (exact match)", () => {
    expect(WIKI_OPS).toEqual([
      "wiki.ingest.analysis",
      "wiki.ingest.generation",
      "wiki.query.shortlist",
      "wiki.query.synthesis",
      "wiki.lint.semantic",
      "wiki.save-as-page",
    ]);
  });

  it("ALL_OPS merges CORE_OPS and WIKI_OPS without loss", () => {
    for (const op of CORE_OPS) expect(ALL_OPS).toContain(op);
    for (const op of WIKI_OPS) expect(ALL_OPS).toContain(op);
    expect(ALL_OPS).toHaveLength(CORE_OPS.length + WIKI_OPS.length);
  });

  it("CORE_OPS contains legacy ask/embed/tutor entries (back-compat)", () => {
    expect(CORE_OPS).toContain("ask");
    expect(CORE_OPS).toContain("embed");
    expect(CORE_OPS).toContain("tutor");
  });
});

describe("isWikiOp", () => {
  it("returns true for every WIKI_OPS entry", () => {
    for (const op of WIKI_OPS) expect(isWikiOp(op)).toBe(true);
  });

  it("returns false for non-wiki ops", () => {
    expect(isWikiOp("ask")).toBe(false);
    expect(isWikiOp("embed")).toBe(false);
    expect(isWikiOp("tutor")).toBe(false);
  });

  it("returns false for unknown strings", () => {
    expect(isWikiOp("wiki")).toBe(false);
    expect(isWikiOp("wiki.unknown")).toBe(false);
    expect(isWikiOp("")).toBe(false);
  });
});

describe("isValidOp", () => {
  it("accepts every ALL_OPS entry", () => {
    for (const op of ALL_OPS) expect(isValidOp(op)).toBe(true);
  });

  it("rejects typos and unknown strings", () => {
    expect(isValidOp("wiki.ingest")).toBe(false); // truncated
    expect(isValidOp("wiki.save_as_page")).toBe(false); // underscore vs dash
    expect(isValidOp("asks")).toBe(false);
    expect(isValidOp("")).toBe(false);
  });
});
