import { describe, expect, it } from "vitest";
import { buildAnalysisPrompt } from "../prompts/analysis.js";
import type { ExistingPage } from "../types.js";
import { MAX_EXISTING_PAGES, PROMPT_VERSION } from "../constants.js";

const TINY_SOURCE = "VPN 설정 가이드. 사내 망에 접속하려면 인증서 설치 후 GlobalProtect 연결.";

function makePages(count: number): ExistingPage[] {
  return Array.from({ length: count }).map((_, i) => ({
    path: `auto/concepts/page-${i + 1}.md`,
    title: `페이지 ${i + 1}`,
    summary: i % 2 === 0 ? `요약 ${i + 1}` : undefined,
  }));
}

describe("buildAnalysisPrompt — structure", () => {
  it("returns exactly [system, user] with the correct roles", () => {
    const msgs = buildAnalysisPrompt({ source: TINY_SOURCE, existingPages: [] });
    expect(msgs).toHaveLength(2);
    expect(msgs[0]?.role).toBe("system");
    expect(msgs[1]?.role).toBe("user");
  });

  it("embeds the prompt version marker in the system message", () => {
    const msgs = buildAnalysisPrompt({ source: TINY_SOURCE, existingPages: [] });
    expect(msgs[0]?.content).toContain(`prompt_version: ${PROMPT_VERSION}`);
    expect(msgs[0]?.content).toContain("step: analysis");
  });

  it("declares the JSON schema contract verbatim", () => {
    const msgs = buildAnalysisPrompt({ source: TINY_SOURCE, existingPages: [] });
    const system = msgs[0]?.content ?? "";
    expect(system).toContain('"keyEntities"');
    expect(system).toContain('"keyConcepts"');
    expect(system).toContain('"findings"');
    expect(system).toContain('"contradictions"');
    expect(system).toContain('"recommendations"');
  });

  it("wraps raw source in <user_content> tags to guard injection", () => {
    const msgs = buildAnalysisPrompt({ source: TINY_SOURCE, existingPages: [] });
    const user = msgs[1]?.content ?? "";
    expect(user).toContain("<user_content>");
    expect(user).toContain("</user_content>");
    expect(user).toContain(TINY_SOURCE);
  });
});

describe("buildAnalysisPrompt — existingPages cap", () => {
  it("renders an 'empty' sentinel when existingPages = []", () => {
    const msgs = buildAnalysisPrompt({ source: TINY_SOURCE, existingPages: [] });
    expect(msgs[0]?.content).toContain("(비어 있음");
  });

  it("renders 5 index rows without truncation note", () => {
    const pages = makePages(5);
    const msgs = buildAnalysisPrompt({ source: TINY_SOURCE, existingPages: pages });
    const system = msgs[0]?.content ?? "";
    for (const p of pages) {
      expect(system).toContain(p.path);
      expect(system).toContain(p.title);
    }
    expect(system).toContain(`(5/5 pages shown`);
  });

  it("caps existingPages at MAX_EXISTING_PAGES (15) when more are supplied", () => {
    const pages = makePages(20);
    const msgs = buildAnalysisPrompt({ source: TINY_SOURCE, existingPages: pages });
    const system = msgs[0]?.content ?? "";
    // First 15 must be present, last 5 must be absent.
    for (let i = 0; i < MAX_EXISTING_PAGES; i++) {
      expect(system).toContain(pages[i]!.path);
    }
    for (let i = MAX_EXISTING_PAGES; i < pages.length; i++) {
      expect(system).not.toContain(pages[i]!.path);
    }
    expect(system).toContain(`(${MAX_EXISTING_PAGES}/20 pages shown`);
  });
});

describe("buildAnalysisPrompt — Korean enterprise samples", () => {
  it("handles mixed Korean/English content with domain terms", () => {
    const pages: ExistingPage[] = [
      { path: "auto/concepts/인사-규정.md", title: "인사 규정", summary: "휴가·출장·복리후생 규정 요약" },
      { path: "auto/concepts/vpn-설정.md", title: "VPN 설정", summary: "GlobalProtect 설정 절차" },
    ];
    const msgs = buildAnalysisPrompt({
      source: "인사 규정에 따르면 연차는 15일이며, VPN 설정은 IT 지원팀에 문의한다.",
      existingPages: pages,
      sourceFileName: "인사규정_2026.docx",
      folderContext: "policies/hr",
    });
    const system = msgs[0]?.content ?? "";
    const user = msgs[1]?.content ?? "";

    expect(system).toContain("auto/concepts/인사-규정.md");
    expect(system).toContain("VPN 설정");
    expect(user).toContain("인사규정_2026.docx");
    expect(user).toContain("policies/hr");
    expect(user).toContain("인사 규정");
  });
});
