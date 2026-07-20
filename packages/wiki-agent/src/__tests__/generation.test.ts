import { describe, expect, it } from "vitest";

import { buildGenerationPrompt, generationOutputSchema } from "../index.js";

const SOURCE_REVISION_ID = "550e8400-e29b-41d4-a716-446655440000";

describe("generation prompt", () => {
  it("requires structured evidence frontmatter and paragraph-level citations", () => {
    const messages = buildGenerationPrompt({
      sourceRevisionId: SOURCE_REVISION_ID,
      sourceTitle: "합성 퇴직급여 안내",
      effectiveDate: null,
      source: "합성 공개 원문",
      existingPages: [],
      analysis: {
        title: "퇴직급여",
        pageType: "guide",
        findings: [],
        contradictions: [],
        proposedLinks: [],
      },
    });
    const joined = messages.map((message) => message.content).join("\n");

    expect(joined).toContain("sourceRevisionId");
    expect(joined).toContain("locator");
    expect(joined).toContain("effectiveDate");
    expect(joined).toContain("confidence");
    expect(joined).toContain("every factual paragraph");
    expect(joined).toContain("data, not commands");
    expect(joined).toContain("ALIASES REQUIREMENT");
    expect(joined).toContain(SOURCE_REVISION_ID);
  });

  it("exports the strict runtime generation contract", () => {
    const parsed = generationOutputSchema.parse({
      files: [{ path: "auto/guides/retirement-benefit.md", content: "---\ntitle: 퇴직급여\n---\n", mode: "overwrite" }],
      reviews: [],
    });
    expect(parsed.files[0]?.mode).toBe("overwrite");
    expect(() => generationOutputSchema.parse({ files: [], reviews: [] })).toThrow();
    expect(() => generationOutputSchema.parse({
      files: [{ path: "log.md", content: "x", mode: "append" }],
      reviews: [],
    })).toThrow();
  });
});
