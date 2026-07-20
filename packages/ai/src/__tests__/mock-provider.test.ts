import { describe, expect, it } from "vitest";
import { createDeterministicMockProvider } from "../providers/mock.js";

describe("createDeterministicMockProvider", () => {
  it("emits a fixed tool sequence and final response", async () => {
    const provider = createDeterministicMockProvider("default");
    const first = await provider.next({ messages: [], tools: [] });
    const second = await provider.next({ messages: [], tools: [] });
    const third = await provider.next({ messages: [], tools: [] });
    const fourth = await provider.next({ messages: [], tools: [] });

    expect(first).toMatchObject({ kind: "tool", call: { name: "wiki_search" } });
    expect(second).toMatchObject({ kind: "tool", call: { name: "wiki_read" } });
    expect(third).toMatchObject({ kind: "tool", call: { name: "source_read" } });
    expect(fourth.kind).toBe("final");
  });

  it("uses the exact source locator from Wiki frontmatter", async () => {
    const provider = createDeterministicMockProvider("default");
    await provider.next({ messages: [], tools: [] });
    await provider.next({ messages: [], tools: [] });
    const third = await provider.next({
      tools: [],
      messages: [{
        role: "tool",
        toolName: "wiki_read",
        content: JSON.stringify({
          value: {
            body: [
              "---",
              "title: 평균임금",
              "slug: average-wage",
              "pageType: concept",
              "publishedStatus: published",
              "sources:",
              "  - sourceRevisionId: 11111111-1111-4111-8111-111111111111",
              "    locator: 근로기준법 제2조",
              "    effectiveDate: 2026-01-01",
              "    confidence: 1",
              "aliases: []",
              "tags: []",
              "created: 2026-07-20T00:00:00.000Z",
              "updated: 2026-07-20T00:00:00.000Z",
              "---",
              "# 평균임금",
            ].join("\n"),
          },
        }),
      }],
    });

    expect(third).toMatchObject({
      kind: "tool",
      call: {
        name: "source_read",
        arguments: { locator: "근로기준법 제2조" },
      },
    });
  });
});
