// packages/ai/agent/__tests__/prompt.test.ts
//
// Phase B4 — system prompt 계약 테스트.
// prompt 문자열이 반드시 담아야 하는 내용을 assertion 으로 고정해
// 향후 회귀를 막는다.

import { describe, expect, it } from "vitest";
import { ASK_SYSTEM_PROMPT, MAX_TOOL_STEPS } from "../ask-agent.js";

describe("ASK_SYSTEM_PROMPT", () => {
  it("mentions all four tools", () => {
    expect(ASK_SYSTEM_PROMPT).toContain("wiki_grep");
    expect(ASK_SYSTEM_PROMPT).toContain("wiki_read");
    expect(ASK_SYSTEM_PROMPT).toContain("wiki_follow_link");
    expect(ASK_SYSTEM_PROMPT).toContain("wiki_graph_query");
  });

  it("requires [[slug]] citation format explicitly", () => {
    expect(ASK_SYSTEM_PROMPT).toContain("[[slug]]");
    expect(ASK_SYSTEM_PROMPT).toContain("citation");
  });

  it("provides a grounding fallback ('문서에 해당 정보가 없습니다')", () => {
    expect(ASK_SYSTEM_PROMPT).toContain("문서에 해당 정보가 없습니다");
  });

  it("exposes MAX_TOOL_STEPS as the tool-call budget", () => {
    expect(ASK_SYSTEM_PROMPT).toContain(String(MAX_TOOL_STEPS));
  });

  it("notes workspace + permission scoping", () => {
    expect(ASK_SYSTEM_PROMPT).toContain("workspace");
    expect(ASK_SYSTEM_PROMPT).toContain("권한");
  });

  it("includes a concrete 답변 예시 with [[slug]] usage", () => {
    // 예시 블록이 citation 포함 패턴을 보여줘야 한다
    expect(ASK_SYSTEM_PROMPT).toMatch(/답변 예[\s\S]*\[\[[a-z0-9-]+\]\]/);
  });
});
