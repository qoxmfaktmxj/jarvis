/**
 * scripts/tests/fill-aliases.test.ts
 *
 * Unit tests for fill-aliases (Task 4.5 — LLM aliases fill for manual wiki).
 * Pure-function tests only — no LLM calls, no filesystem I/O.
 *
 * Run:
 *   pnpm exec vitest run scripts/tests/fill-aliases.test.ts
 */

import { describe, it, expect } from "vitest";
import { upsertAliasesInFrontmatter, extractBodySnippet } from "../fill-aliases.js";

describe("upsertAliasesInFrontmatter", () => {
  it("adds aliases key to existing frontmatter", () => {
    const md = `---\ntitle: "휴가 규정"\ntype: policy\n---\n\nBody`;
    const out = upsertAliasesInFrontmatter(md, ["휴가", "연차", "빙부상"]);
    expect(out).toContain("aliases:");
    expect(out).toContain('  - "휴가"');
    expect(out).toContain('  - "빙부상"');
    expect(out).toContain('title: "휴가 규정"'); // 보존
    expect(out).toContain("type: policy"); // 보존
  });

  it("replaces existing aliases if already present", () => {
    const md = `---\ntitle: "T"\naliases:\n  - "old"\n---\nBody`;
    const out = upsertAliasesInFrontmatter(md, ["new1", "new2", "new3"]);
    expect(out).not.toContain("old");
    expect(out).toContain("new1");
  });

  it("throws if no frontmatter", () => {
    expect(() =>
      upsertAliasesInFrontmatter("# No frontmatter\nbody", ["a"]),
    ).toThrow();
  });

  it("preserves all non-aliases frontmatter fields", () => {
    const md = [
      "---",
      'title: "급여 정책"',
      "type: policy",
      "authority: manual",
      "sensitivity: INTERNAL",
      "domain: hr",
      "---",
      "",
      "본문입니다.",
    ].join("\n");
    const out = upsertAliasesInFrontmatter(md, ["급여", "통상임금"]);
    expect(out).toContain("type: policy");
    expect(out).toContain("authority: manual");
    expect(out).toContain("sensitivity: INTERNAL");
    expect(out).toContain("domain: hr");
    expect(out).toContain("본문입니다.");
  });

  it("result is valid frontmatter structure (starts with --- block)", () => {
    const md = `---\ntitle: "T"\n---\nbody`;
    const out = upsertAliasesInFrontmatter(md, ["alias1"]);
    expect(out.startsWith("---\n")).toBe(true);
    // body preserved after closing ---
    expect(out).toContain("body");
  });
});

describe("extractBodySnippet", () => {
  it("returns first 500 chars of body after frontmatter", () => {
    const md = `---\ntitle: "T"\n---\n\nFirst para.\n\nSecond para.`;
    expect(extractBodySnippet(md, 500)).toContain("First para");
    expect(extractBodySnippet(md, 500)).not.toContain("---");
  });

  it("truncates to limit", () => {
    const body = "a".repeat(1000);
    const md = `---\ntitle: T\n---\n${body}`;
    expect(extractBodySnippet(md, 100).length).toBeLessThanOrEqual(100);
  });

  it("handles content without frontmatter gracefully", () => {
    const md = "# Just a heading\n\nSome body text.";
    const snippet = extractBodySnippet(md, 500);
    expect(snippet).toContain("Just a heading");
  });
});
