import { describe, expect, it } from "vitest";
import { buildGenerationPrompt } from "../prompts/generation.js";
import { ALIASES_CONTRACT } from "../prompts/aliases-contract.js";
import type { AnalysisResult, ExistingPage } from "../types.js";
import { MIN_ALIASES, PROMPT_VERSION } from "../constants.js";

const ANALYSIS: AnalysisResult = {
  keyEntities: [
    { name: "MindVault", type: "product", aliases: ["마인드볼트", "MV"] },
  ],
  keyConcepts: [
    {
      name: "Two-Step CoT",
      summary: "Analysis → Generation 2패스 프롬프트 체인.",
      relatedPageIds: ["auto/concepts/ingest.md"],
    },
  ],
  findings: ["소스-페이지 라우팅은 frontmatter sources 필드에 의존한다."],
  contradictions: [],
  recommendations: ["wiki/auto/concepts/two-step-cot.md 생성"],
};

const SOURCE = "MindVault는 실패했지만 Two-Step CoT 프롬프트 설계는 보존할 가치가 있다.";

describe("buildGenerationPrompt — structure", () => {
  it("returns [system, user] with correct roles", () => {
    const msgs = buildGenerationPrompt({ analysis: ANALYSIS, source: SOURCE, existingPages: [] });
    expect(msgs).toHaveLength(2);
    expect(msgs[0]?.role).toBe("system");
    expect(msgs[1]?.role).toBe("user");
  });

  it("embeds the prompt version marker", () => {
    const msgs = buildGenerationPrompt({ analysis: ANALYSIS, source: SOURCE, existingPages: [] });
    expect(msgs[0]?.content).toContain(`prompt_version: ${PROMPT_VERSION}`);
    expect(msgs[0]?.content).toContain("step: generation");
  });
});

describe("buildGenerationPrompt — ALIASES REQUIREMENT regression guard", () => {
  it("inlines the exact 'ALIASES REQUIREMENT' string (MindVault regression fence)", () => {
    const msgs = buildGenerationPrompt({ analysis: ANALYSIS, source: SOURCE, existingPages: [] });
    const system = msgs[0]?.content ?? "";
    // Exact substring — this test will fail if anyone softens the contract.
    expect(system).toContain("ALIASES REQUIREMENT");
    // The full contract block must be present verbatim.
    expect(system).toContain(ALIASES_CONTRACT);
    // And the concrete MindVault example must be preserved to anchor the LLM.
    expect(system).toContain("MindVault");
    expect(system).toContain("마인드볼트");
    // Minimum count must be stated.
    expect(system).toContain(`최소 ${MIN_ALIASES}개`);
  });

  it("declares Jarvis-specific canonical paths and forbids manual/ writes", () => {
    const msgs = buildGenerationPrompt({ analysis: ANALYSIS, source: SOURCE, existingPages: [] });
    const system = msgs[0]?.content ?? "";
    expect(system).toContain("auto/sources/");
    expect(system).toContain("auto/entities/");
    expect(system).toContain("auto/concepts/");
    expect(system).toContain("manual/**");
  });

  it("emits the canonical FILE and REVIEW block templates", () => {
    const msgs = buildGenerationPrompt({ analysis: ANALYSIS, source: SOURCE, existingPages: [] });
    const system = msgs[0]?.content ?? "";
    expect(system).toContain("---FILE:");
    expect(system).toContain("---END FILE---");
    expect(system).toContain("---REVIEW:");
    expect(system).toContain("---END REVIEW---");
  });
});

describe("buildGenerationPrompt — analysis is serialized as JSON", () => {
  it("includes the structured analysis in the user message", () => {
    const msgs = buildGenerationPrompt({ analysis: ANALYSIS, source: SOURCE, existingPages: [] });
    const user = msgs[1]?.content ?? "";
    expect(user).toContain("MindVault");
    expect(user).toContain("Two-Step CoT");
    expect(user).toContain("<user_content>");
    expect(user).toContain("</user_content>");
    expect(user).toContain(SOURCE);
  });
});

describe("buildGenerationPrompt — Title Language Rule", () => {
  it("includes the Title Language Rule section in system prompt", () => {
    const msgs = buildGenerationPrompt({ analysis: ANALYSIS, source: SOURCE, existingPages: [] });
    const system = msgs[0]?.content ?? "";
    expect(system).toContain("Title Language Rule");
    expect(system).toContain("반드시 한국어");
  });

  it("instructs to include English original in aliases for searchability", () => {
    const msgs = buildGenerationPrompt({ analysis: ANALYSIS, source: SOURCE, existingPages: [] });
    const system = msgs[0]?.content ?? "";
    expect(system).toContain("aliases에는 영어 원문 title을 포함");
  });

  it("instructs Korean translation even for English sources", () => {
    const msgs = buildGenerationPrompt({ analysis: ANALYSIS, source: SOURCE, existingPages: [] });
    const system = msgs[0]?.content ?? "";
    expect(system).toContain("소스가 영어여도 title은 한국어로 번역한다");
  });

  it("overrides English titles from existing wiki index", () => {
    const msgs = buildGenerationPrompt({ analysis: ANALYSIS, source: SOURCE, existingPages: [] });
    const system = msgs[0]?.content ?? "";
    expect(system).toContain("Current Wiki Index에 영어 title이 있더라도");
  });
});

describe("buildGenerationPrompt — existingPages rendering", () => {
  it("renders 'preserve all, add only' directive when pages exist", () => {
    const pages: ExistingPage[] = [
      { path: "auto/concepts/ingest.md", title: "Ingest", summary: "" },
      { path: "auto/concepts/rag.md", title: "RAG", summary: "" },
    ];
    const msgs = buildGenerationPrompt({
      analysis: ANALYSIS,
      source: SOURCE,
      existingPages: pages,
    });
    const system = msgs[0]?.content ?? "";
    expect(system).toContain("preserve all, add only");
    expect(system).toContain("auto/concepts/ingest.md");
    expect(system).toContain("auto/concepts/rag.md");
  });
});
