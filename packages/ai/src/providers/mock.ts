import type { LlmProvider, ProviderMessage, ProviderResponse, ToolDefinition } from "../types.js";
import { parseFrontmatter } from "@jarvis/wiki-fs/frontmatter";

export type MockScenario = "default" | "uncited-final";

const FALLBACK_WIKI = { slug: "average-wage", path: "auto/concepts/average-wage.md" };
const FALLBACK_SOURCE = {
  sourceRevisionId: "11111111-1111-4111-8111-111111111111",
  locator: "paragraph:1",
};

export function createDeterministicMockProvider(scenario: MockScenario): LlmProvider {
  let step = 0;
  return {
    providerName: "mock",
    model: `deterministic-${scenario}`,
    async next(input: {
      messages: ProviderMessage[];
      tools: readonly ToolDefinition[];
    }): Promise<ProviderResponse> {
      void input.tools;
      if (scenario === "uncited-final") {
        return final("근거 없이 답변합니다.");
      }

      step += 1;
      const wiki = findWikiReference(input.messages) ?? FALLBACK_WIKI;
      const source = findSourceReference(input.messages) ?? FALLBACK_SOURCE;
      switch (step) {
        case 1:
          return tool("wiki_search", { query: findUserQuestion(input.messages) ?? "평균임금" });
        case 2:
          return tool("wiki_read", wiki);
        case 3:
          return tool("source_read", {
            source_revision_id: source.sourceRevisionId,
            locator: source.locator,
          });
        default:
          return final(
            `평균임금은 통상적인 산정 기준 임금을 뜻합니다. [[${wiki.slug}]] ` +
            `[source:${source.sourceRevisionId}#${source.locator}]`,
          );
      }
    },
  };
}

function findUserQuestion(messages: readonly ProviderMessage[]): string | null {
  const message = [...messages].reverse().find((candidate) => candidate.role === "user");
  const question = message?.content.trim();
  return question || null;
}

function findWikiReference(messages: readonly ProviderMessage[]): { slug: string; path: string } | null {
  for (const value of untrustedValues(messages)) {
    if (!Array.isArray(value)) continue;
    const hit = value.find((row) => isRecord(row) && row.resourceType === "wiki" &&
      typeof row.slug === "string" && typeof row.path === "string");
    if (isRecord(hit) && typeof hit.slug === "string" && typeof hit.path === "string") {
      return { slug: hit.slug, path: hit.path };
    }
  }
  return null;
}

function findSourceReference(messages: readonly ProviderMessage[]): {
  sourceRevisionId: string;
  locator: string;
} | null {
  for (const value of untrustedValues(messages).reverse()) {
    if (Array.isArray(value)) {
      const hit = value.find((row) => isRecord(row) && row.resourceType === "source" &&
        typeof row.sourceRevisionId === "string");
      if (isRecord(hit) && typeof hit.sourceRevisionId === "string") {
        return {
          sourceRevisionId: hit.sourceRevisionId,
          locator: typeof hit.locator === "string" && hit.locator ? hit.locator : "document",
        };
      }
      continue;
    }
    if (isRecord(value) && typeof value.body === "string") {
      try {
        const [source] = parseFrontmatter(value.body).data.sources;
        if (source) {
          return {
            sourceRevisionId: source.sourceRevisionId,
            locator: source.locator,
          };
        }
      } catch {
        // Malformed Wiki content is ignored by the deterministic provider.
      }
    }
    if (isRecord(value) && typeof value.sourceRevisionId === "string" && typeof value.locator === "string") {
      return { sourceRevisionId: value.sourceRevisionId, locator: value.locator };
    }
  }
  return null;
}

function untrustedValues(messages: readonly ProviderMessage[]): unknown[] {
  const values: unknown[] = [];
  for (const message of messages) {
    if (message.role !== "tool") continue;
    try {
      const parsed = JSON.parse(message.content) as unknown;
      if (isRecord(parsed) && "value" in parsed) values.push(parsed.value);
    } catch {
      // The deterministic provider treats malformed tool messages as absent data.
    }
  }
  return values;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function tool(
  name: "wiki_search" | "wiki_read" | "source_read" | "wiki_follow_link",
  args: Record<string, unknown>,
): ProviderResponse {
  return {
    kind: "tool",
    call: { name, arguments: args },
    usage: { promptTokens: 10, completionTokens: 5, costUsd: "0" },
  };
}

function final(text: string): ProviderResponse {
  return {
    kind: "final",
    text,
    usage: { promptTokens: 10, completionTokens: 5, costUsd: "0" },
  };
}
