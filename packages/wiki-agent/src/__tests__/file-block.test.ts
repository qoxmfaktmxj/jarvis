import { describe, expect, it } from "vitest";
import { parseFileBlocks } from "../parsers/file-block.js";

describe("parseFileBlocks — single block", () => {
  it("parses one well-formed FILE block", () => {
    const text = [
      "---FILE: auto/concepts/휴가-정책.md---",
      "---",
      "title: \"휴가 정책\"",
      "type: concept",
      "aliases: [\"vacation policy\", \"연차\", \"PTO\"]",
      "---",
      "",
      "본문...",
      "---END FILE---",
    ].join("\n");
    const blocks = parseFileBlocks(text);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.path).toBe("auto/concepts/휴가-정책.md");
    expect(blocks[0]?.mode).toBe("overwrite");
    expect(blocks[0]?.content).toContain("title: \"휴가 정책\"");
    expect(blocks[0]?.content).toContain("본문...");
  });

  it("ignores leading/trailing whitespace in the path", () => {
    const text = "---FILE:   auto/x.md   ---\nbody\n---END FILE---";
    const blocks = parseFileBlocks(text);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.path).toBe("auto/x.md");
  });
});

describe("parseFileBlocks — multiple blocks (3件)", () => {
  it("parses three consecutive blocks in order", () => {
    const text = [
      "---FILE: auto/sources/ai-policy.md---",
      "source body",
      "---END FILE---",
      "",
      "---FILE: auto/entities/Acme.md---",
      "entity body",
      "---END FILE---",
      "",
      "---FILE: auto/concepts/kpi.md---",
      "concept body",
      "---END FILE---",
    ].join("\n");
    const blocks = parseFileBlocks(text);
    expect(blocks).toHaveLength(3);
    expect(blocks.map((b) => b.path)).toEqual([
      "auto/sources/ai-policy.md",
      "auto/entities/Acme.md",
      "auto/concepts/kpi.md",
    ]);
    expect(blocks[0]?.content).toBe("source body");
    expect(blocks[1]?.content).toBe("entity body");
    expect(blocks[2]?.content).toBe("concept body");
  });

  it("does not cross block boundaries due to lazy matching", () => {
    // A malicious body containing --FILE header-like text must not break parsing.
    const text = [
      "---FILE: auto/a.md---",
      "body of A with a weird line ---FILE: fake.md--- inside",
      "---END FILE---",
      "---FILE: auto/b.md---",
      "body of B",
      "---END FILE---",
    ].join("\n");
    const blocks = parseFileBlocks(text);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]?.path).toBe("auto/a.md");
    expect(blocks[1]?.path).toBe("auto/b.md");
  });
});

describe("parseFileBlocks — log.md append mode", () => {
  it("tags log.md (root) with mode='append'", () => {
    const text = "---FILE: log.md---\n## [2026-04-15] ingest | VPN Setup\n---END FILE---";
    const blocks = parseFileBlocks(text);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.mode).toBe("append");
  });

  it("tags wiki/log.md and nested */log.md with mode='append'", () => {
    const text = [
      "---FILE: wiki/log.md---",
      "## [2026-04-15] ingest | A",
      "---END FILE---",
      "---FILE: auto/log.md---",
      "## [2026-04-15] ingest | B",
      "---END FILE---",
    ].join("\n");
    const blocks = parseFileBlocks(text);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]?.mode).toBe("append");
    expect(blocks[1]?.mode).toBe("append");
  });
});

describe("parseFileBlocks — malformed input tolerance", () => {
  it("ignores a block that is missing the END marker", () => {
    const text = [
      "---FILE: auto/a.md---",
      "body A",
      "---END FILE---",
      "---FILE: auto/b.md---",
      "body B (never closed)",
    ].join("\n");
    const blocks = parseFileBlocks(text);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.path).toBe("auto/a.md");
  });

  it("returns [] on empty / unrelated text", () => {
    expect(parseFileBlocks("")).toEqual([]);
    expect(parseFileBlocks("just some markdown with no blocks")).toEqual([]);
  });

  it("skips blocks with empty path after trimming", () => {
    const text = "---FILE:    ---\nbody\n---END FILE---";
    expect(parseFileBlocks(text)).toEqual([]);
  });
});
