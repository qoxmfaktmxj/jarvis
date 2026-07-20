import type { WikiCompletionClient } from "../jobs/ingest/analyze.js";

function yamlString(value: string): string {
  return JSON.stringify(value);
}

const deterministicWikiModel: WikiCompletionClient = {
  async complete(input) {
    if (input.purpose === "wiki-analyze") {
      return JSON.stringify({
        title: input.sourceTitle,
        pageType: "source",
        findings: [
          {
            claim: "공개 데모 원문의 내용을 구조화한 근거 페이지입니다.",
            sourceRevisionId: input.sourceRevisionId,
            locator: "document",
            effectiveDate: input.effectiveDate,
            confidence: 1,
          },
        ],
        contradictions: [],
        proposedLinks: [],
      });
    }

    const slug = `source-${input.sourceRevisionId.toLowerCase()}`;
    const path = `auto/sources/${slug}.md`;
    const date = input.effectiveDate ?? "2026-01-01";
    const title = input.sourceTitle.replace(/\s+/g, " ").trim();
    const content = [
      "---",
      `title: ${yamlString(title)}`,
      `slug: ${yamlString(slug)}`,
      "pageType: source",
      "publishedStatus: draft",
      "sources:",
      `  - sourceRevisionId: ${input.sourceRevisionId}`,
      "    locator: document",
      `    effectiveDate: ${input.effectiveDate ?? "null"}`,
      "    confidence: 1",
      "aliases:",
      `  - ${yamlString(title)}`,
      `  - ${yamlString(`${title} 근거`)}`,
      `  - ${yamlString(`HR 합성 근거 ${input.sourceRevisionId.slice(0, 8)}`)}`,
      "tags:",
      "  - synthetic",
      "  - hr-compliance",
      `created: ${date}T00:00:00.000Z`,
      `updated: ${date}T00:00:00.000Z`,
      "---",
      "",
      `# ${title}`,
      "",
      `이 페이지는 합성 공개 원문의 구조를 보여주는 데모입니다. [source:${input.sourceRevisionId}#document]`,
      "",
    ].join("\n");

    return [`---FILE: ${path}---`, content, "---END FILE---"].join("\n");
  },
};

export function createWorkerWikiModel(
  env: Record<string, string | undefined> = process.env,
): WikiCompletionClient {
  const mode = (env.LLM_MODE ?? "mock").trim().toLowerCase();
  if (mode !== "mock") {
    throw new Error(`LLM_MODE=${mode} is not registered for worker Wiki ingest`);
  }
  if (env.NODE_ENV === "production" && env.ALLOW_PRODUCTION_MOCK !== "true") {
    throw new Error("production mock requires ALLOW_PRODUCTION_MOCK=true");
  }
  return deterministicWikiModel;
}
