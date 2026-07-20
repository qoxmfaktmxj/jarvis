import { describe, expect, it } from "vitest";

import { defaultFrontmatter, parseFrontmatter, serializeFrontmatter, splitFrontmatter } from "../frontmatter.js";

const STRICT_SOURCE = [
  "---",
  "title: 공개 문서",
  "slug: public-doc",
  "pageType: concept",
  "publishedStatus: draft",
  "sources:",
  "  - sourceRevisionId: 550e8400-e29b-41d4-a716-446655440000",
  "    locator: document",
  "    effectiveDate: 2026-07-01",
  "    confidence: 1",
  "aliases:",
  "  - 공개",
  "tags:",
  "  - policy",
  "created: 2026-07-01T00:00:00.000Z",
  "updated: 2026-07-01T00:00:00.000Z",
  "freshnessSlaDays: 30",
  "---",
  "본문",
].join("\n");

describe("strict frontmatter", () => {
  it("round-trips structured evidence sources exactly", () => {
    const parsed = parseFrontmatter(STRICT_SOURCE);
    expect(parsed.data.sources).toEqual([
      {
        sourceRevisionId: "550e8400-e29b-41d4-a716-446655440000",
        locator: "document",
        effectiveDate: "2026-07-01",
        confidence: 1,
      },
    ]);
    expect(serializeFrontmatter(parsed.data, parsed.body)).toBe(STRICT_SOURCE);
  });

  it("rejects legacy and unknown keys", () => {
    const legacy = [
      "---",
      "title: ok",
      "slug: ok",
      "pageType: concept",
      "publishedStatus: draft",
      "sensitivity: restricted",
      "requiredPermission: legacy:all",
      "authority: manual",
      "linkedPages:",
      "  - x",
      "legacyKey: nope",
      "---",
      "body",
    ].join("\n");
    expect(() => parseFrontmatter(legacy)).toThrow(/disallowed frontmatter key/i);
  });

  it("rejects string-valued legacy sources and invalid evidence dates", () => {
    const legacySources = STRICT_SOURCE.replace(
      /sources:\n(?: {2,}.*\n){4}/,
      "sources:\n  - raw_123\n",
    );
    expect(() => parseFrontmatter(legacySources)).toThrow(/sources/i);
    expect(() => parseFrontmatter(STRICT_SOURCE.replace("2026-07-01\n    confidence", "2026-02-31\n    confidence"))).toThrow(
      /effectiveDate/i,
    );
  });

  it("normalizes CRLF splitting and supplies defaults only when no block exists", () => {
    const split = splitFrontmatter("---\r\ntitle: x\r\n---\r\nbody\r\n");
    expect(split).toEqual({ frontmatter: "title: x", body: "body\n" });
    const parsed = parseFrontmatter("# body only\r\n");
    expect(parsed.body).toBe("# body only\n");
    expect(parsed.data).toMatchObject({ pageType: "concept", publishedStatus: "draft", sources: [] });
  });

  it("returns independent default arrays", () => {
    const first = defaultFrontmatter();
    const second = defaultFrontmatter();
    first.tags.push("one");
    expect(second.tags).toEqual([]);
  });
});
