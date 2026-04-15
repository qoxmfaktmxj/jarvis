/**
 * apps/worker/src/__tests__/integration/wiki-lint.test.ts
 *
 * Phase-W2 T3 — integration-ish tests for the weekly wiki lint pipeline.
 *
 * We test the pure helpers (pairing, report markdown, hub-path predicate,
 * lexical similarity) without needing a DB. DB-backed paths are covered
 * by `runWikiLint` with an injected workspace list + dryRun=true against
 * the real DB when `DATABASE_URL` is set (skipped otherwise).
 */

import { describe, it, expect } from "vitest";

import {
  buildLintReportMarkdown,
  formatDateUtc,
} from "../../jobs/wiki-lint.js";
import { isHubPath } from "../../jobs/wiki-lint/orphans.js";
import { buildCandidatePairs } from "../../jobs/wiki-lint/contradictions.js";
import { lexicalSimilarity } from "../../jobs/wiki-lint/missing-cross-refs.js";

describe("wiki-lint helpers", () => {
  describe("isHubPath", () => {
    it("flags index.md / log.md / _system paths", () => {
      expect(isHubPath("wiki/ws1/index.md")).toBe(true);
      expect(isHubPath("wiki/ws1/log.md")).toBe(true);
      expect(isHubPath("wiki/ws1/_system/lint-report-2026-04-15.md")).toBe(true);
    });

    it("does not flag regular auto/manual pages", () => {
      expect(isHubPath("wiki/ws1/auto/concepts/hr-reform.md")).toBe(false);
      expect(isHubPath("wiki/ws1/manual/guides/onboarding.md")).toBe(false);
    });

    it("normalizes windows-style separators", () => {
      expect(isHubPath("wiki\\ws1\\_system\\lint.md")).toBe(true);
    });
  });

  describe("buildCandidatePairs (contradiction candidates)", () => {
    const pageA = {
      id: "a",
      path: "a.md",
      title: "A",
      slug: "a",
      tags: ["hr"],
      aliases: ["인사"],
    };
    const pageB = {
      id: "b",
      path: "b.md",
      title: "B",
      slug: "b",
      tags: ["hr"],
      aliases: ["인사제도"],
    };
    const pageC = {
      id: "c",
      path: "c.md",
      title: "C",
      slug: "c",
      tags: ["finance"],
      aliases: ["회계"],
    };

    it("emits pairs that share at least one tag", () => {
      const pairs = buildCandidatePairs([pageA, pageB, pageC]);
      expect(pairs).toHaveLength(1);
      expect(pairs[0]![0].id).toBe("a");
      expect(pairs[0]![1].id).toBe("b");
    });

    it("emits pairs that share at least one alias (case-insensitive)", () => {
      const x = { ...pageA, aliases: ["HR"] };
      const y = { ...pageC, tags: [], aliases: ["hr"] };
      const pairs = buildCandidatePairs([x, y]);
      expect(pairs).toHaveLength(1);
    });

    it("returns no pairs when nothing overlaps", () => {
      const pairs = buildCandidatePairs([pageC]);
      expect(pairs).toHaveLength(0);
    });
  });

  describe("lexicalSimilarity (missing-xref)", () => {
    it("returns 0 when no tags or aliases are shared", () => {
      const { score, reason } = lexicalSimilarity(
        { tags: ["a"], aliases: ["x"] },
        { tags: ["b"], aliases: ["y"] },
      );
      expect(score).toBe(0);
      expect(reason).toBe("");
    });

    it("prefers alias match reason when both tags and aliases overlap", () => {
      const { score, reason } = lexicalSimilarity(
        { tags: ["shared"], aliases: ["인사"] },
        { tags: ["shared"], aliases: ["인사"] },
      );
      expect(score).toBeGreaterThan(0);
      expect(reason).toMatch(/^alias:/);
    });

    it("returns tag match reason when only tags overlap", () => {
      const { reason } = lexicalSimilarity(
        { tags: ["finance"], aliases: ["a"] },
        { tags: ["finance"], aliases: ["b"] },
      );
      expect(reason).toBe("tag:finance");
    });

    it("caps score at 1", () => {
      const { score } = lexicalSimilarity(
        { tags: [], aliases: ["x", "y", "z"] },
        { tags: [], aliases: ["x", "y", "z"] },
      );
      expect(score).toBeLessThanOrEqual(1);
    });
  });

  describe("formatDateUtc", () => {
    it("pads month/day to 2 digits", () => {
      expect(formatDateUtc(new Date("2026-01-03T12:00:00Z"))).toBe(
        "2026-01-03",
      );
    });
  });

  describe("buildLintReportMarkdown", () => {
    const baseInput = {
      workspaceId: "00000000-0000-0000-0000-000000000000",
      reportDate: "2026-04-15",
      orphans: [],
      brokenLinks: [],
      contradictions: [],
      stale: [],
      missingXrefs: [],
    };

    it("emits frontmatter with INTERNAL sensitivity + authority auto", () => {
      const md = buildLintReportMarkdown(baseInput);
      expect(md).toMatch(/^---\n/);
      expect(md).toMatch(/sensitivity: INTERNAL/);
      expect(md).toMatch(/authority: auto/);
      expect(md).toMatch(/title: Lint Report 2026-04-15/);
    });

    it("shows 0 total issues for empty input", () => {
      const md = buildLintReportMarkdown(baseInput);
      expect(md).toContain("총 이슈: 0");
    });

    it("renders each section only when items exist", () => {
      const md = buildLintReportMarkdown({
        ...baseInput,
        orphans: [
          {
            pageId: "p1",
            path: "wiki/ws/auto/concepts/foo.md",
            title: "Foo",
            slug: "foo",
            type: "concept",
            updatedAt: new Date("2026-04-01T00:00:00Z"),
          },
        ],
        brokenLinks: [
          {
            fromPageId: "p2",
            fromPath: "wiki/ws/auto/concepts/bar.md",
            toPath: "nonexistent",
            alias: null,
            anchor: null,
          },
        ],
      });
      expect(md).toContain("## Orphan Pages");
      expect(md).toContain("[[foo]]");
      expect(md).toContain("## Broken Links");
      expect(md).toContain("[[nonexistent]]");
      expect(md).not.toContain("## Contradictions");
      expect(md).not.toContain("## Stale Claims");
      expect(md).not.toContain("## Missing Cross-refs");
    });

    it("formats contradiction section with confidence", () => {
      const md = buildLintReportMarkdown({
        ...baseInput,
        contradictions: [
          {
            pageA: { id: "a", path: "a.md", title: "A" },
            pageB: { id: "b", path: "b.md", title: "B" },
            description: "A says X, B says not X",
            confidence: 0.85,
          },
        ],
      });
      expect(md).toContain("## Contradictions");
      expect(md).toContain("confidence 0.85");
      expect(md).toContain("A says X, B says not X");
    });
  });
});
