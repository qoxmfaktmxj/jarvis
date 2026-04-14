import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadFixtures } from "./loader.js";

describe("loadFixtures", () => {
  it("parses frontmatter + body for all .md files in a directory", () => {
    const dir = mkdtempSync(join(tmpdir(), "eval-loader-"));
    writeFileSync(
      join(dir, "eval-001.md"),
      `---\nid: eval-001\nquery: "연차는 몇 개?"\nexpected_keywords: ["연차", "15"]\n---\n정책 문서 본문.`,
    );
    writeFileSync(
      join(dir, "eval-002.md"),
      `---\nid: eval-002\nquery: "VPN 설정"\nexpected_keywords: ["VPN"]\n---\n`,
    );
    const items = loadFixtures(dir).sort((a, b) => a.id.localeCompare(b.id));
    expect(items).toHaveLength(2);
    expect(items[0]!.id).toBe("eval-001");
    expect(items[0]!.query).toBe("연차는 몇 개?");
    expect(items[0]!.expected_keywords).toEqual(["연차", "15"]);
    expect(items[0]!.context.trim()).toBe("정책 문서 본문.");
    rmSync(dir, { recursive: true, force: true });
  });

  it("ignores non-md files", () => {
    const dir = mkdtempSync(join(tmpdir(), "eval-loader2-"));
    writeFileSync(join(dir, "note.txt"), "not md");
    writeFileSync(
      join(dir, "eval-001.md"),
      `---\nid: eval-001\nquery: "q"\nexpected_keywords: []\n---\n`,
    );
    expect(loadFixtures(dir)).toHaveLength(1);
    rmSync(dir, { recursive: true, force: true });
  });

  it("throws on missing required frontmatter fields", () => {
    const dir = mkdtempSync(join(tmpdir(), "eval-loader3-"));
    writeFileSync(join(dir, "bad.md"), `---\nid: x\n---\nbody`);
    expect(() => loadFixtures(dir)).toThrow(/query/);
    rmSync(dir, { recursive: true, force: true });
  });
});
