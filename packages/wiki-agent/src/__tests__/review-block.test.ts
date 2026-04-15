import { describe, expect, it } from "vitest";
import { parseReviewBlocks } from "../parsers/review-block.js";

describe("parseReviewBlocks — OPTIONS line extraction", () => {
  it("splits OPTIONS by pipe", () => {
    const text = [
      "---REVIEW: contradiction | Conflicting VPN policy---",
      "The new source contradicts auto/concepts/vpn-설정.md.",
      "OPTIONS: Create Page | Skip",
      "---END REVIEW---",
    ].join("\n");
    const blocks = parseReviewBlocks(text);
    expect(blocks).toHaveLength(1);
    const b = blocks[0]!;
    expect(b.type).toBe("contradiction");
    expect(b.title).toBe("Conflicting VPN policy");
    expect(b.options).toEqual(["Create Page", "Skip"]);
    // Meta line must be removed from body.
    expect(b.body).not.toContain("OPTIONS:");
    expect(b.body).toContain("contradicts");
  });

  it("tolerates missing OPTIONS (options stays undefined)", () => {
    const text = [
      "---REVIEW: suggestion | Investigate something---",
      "Worth looking into.",
      "---END REVIEW---",
    ].join("\n");
    const blocks = parseReviewBlocks(text);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.options).toBeUndefined();
  });
});

describe("parseReviewBlocks — PAGES line extraction", () => {
  it("splits PAGES by comma", () => {
    const text = [
      "---REVIEW: duplicate | MindVault already exists---",
      "Probable duplicate entity.",
      "OPTIONS: Create Page | Skip",
      "PAGES: auto/entities/MindVault.md, auto/concepts/mindvault.md",
      "---END REVIEW---",
    ].join("\n");
    const blocks = parseReviewBlocks(text);
    expect(blocks).toHaveLength(1);
    const b = blocks[0]!;
    expect(b.type).toBe("duplicate");
    expect(b.pages).toEqual([
      "auto/entities/MindVault.md",
      "auto/concepts/mindvault.md",
    ]);
    expect(b.body).not.toContain("PAGES:");
  });

  it("returns empty arrays for empty meta values (absent vs explicitly empty)", () => {
    const text = [
      "---REVIEW: missing-page | Needs dedicated page---",
      "A key concept has no page.",
      "OPTIONS:",
      "PAGES:",
      "---END REVIEW---",
    ].join("\n");
    const blocks = parseReviewBlocks(text);
    expect(blocks).toHaveLength(1);
    const b = blocks[0]!;
    expect(b.options).toEqual([]);
    expect(b.pages).toEqual([]);
  });
});

describe("parseReviewBlocks — SEARCH line extraction", () => {
  it("splits SEARCH by pipe and preserves query shape", () => {
    const text = [
      "---REVIEW: suggestion | Research Two-Step CoT---",
      "Worth investigating related literature.",
      "OPTIONS: Create Page | Skip",
      "SEARCH: two-step chain of thought prompting | llm wiki compilation | karpathy llm wiki",
      "---END REVIEW---",
    ].join("\n");
    const blocks = parseReviewBlocks(text);
    expect(blocks).toHaveLength(1);
    const b = blocks[0]!;
    expect(b.type).toBe("suggestion");
    expect(b.search).toEqual([
      "two-step chain of thought prompting",
      "llm wiki compilation",
      "karpathy llm wiki",
    ]);
    expect(b.body).not.toContain("SEARCH:");
  });

  it("parses all three meta lines together", () => {
    const text = [
      "---REVIEW: missing-page | HR policy gap---",
      "인사 규정 페이지가 구체적 휴가 절차를 다루지 않는다.",
      "OPTIONS: Create Page | Skip",
      "PAGES: auto/concepts/인사-규정.md",
      "SEARCH: 사내 연차 규정 샘플 | enterprise PTO policy template",
      "---END REVIEW---",
    ].join("\n");
    const blocks = parseReviewBlocks(text);
    expect(blocks).toHaveLength(1);
    const b = blocks[0]!;
    expect(b.type).toBe("missing-page");
    expect(b.title).toBe("HR policy gap");
    expect(b.options).toEqual(["Create Page", "Skip"]);
    expect(b.pages).toEqual(["auto/concepts/인사-규정.md"]);
    expect(b.search).toEqual([
      "사내 연차 규정 샘플",
      "enterprise PTO policy template",
    ]);
    expect(b.body).toContain("휴가 절차");
  });
});

describe("parseReviewBlocks — malformed input tolerance", () => {
  it("returns [] on empty / unrelated text", () => {
    expect(parseReviewBlocks("")).toEqual([]);
    expect(parseReviewBlocks("just some text")).toEqual([]);
  });

  it("ignores blocks missing the END marker", () => {
    const text = [
      "---REVIEW: suggestion | Incomplete---",
      "Never closed.",
    ].join("\n");
    expect(parseReviewBlocks(text)).toEqual([]);
  });

  it("parses multiple REVIEW blocks in one output", () => {
    const text = [
      "---REVIEW: contradiction | A---",
      "body A",
      "OPTIONS: Create Page | Skip",
      "---END REVIEW---",
      "",
      "---REVIEW: duplicate | B---",
      "body B",
      "OPTIONS: Create Page | Skip",
      "PAGES: auto/x.md",
      "---END REVIEW---",
    ].join("\n");
    const blocks = parseReviewBlocks(text);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]?.type).toBe("contradiction");
    expect(blocks[1]?.type).toBe("duplicate");
    expect(blocks[1]?.pages).toEqual(["auto/x.md"]);
  });
});
