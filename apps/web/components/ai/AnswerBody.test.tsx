// @vitest-environment jsdom
/// <reference types="vitest" />
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { SourceRef, WikiPageSourceRef } from "@jarvis/ai/types";
import { AnswerBody } from "./AnswerBody";

vi.mock("./WikiPanelContext", () => ({
  useWikiPanel: () => ({ hasProvider: false, open: vi.fn() }),
}));

// jsdom does not implement window.matchMedia — stub it globally for this file.
const makeMatchMedia = (matches: boolean) => (query: string) => ({
  matches,
  media: query,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
  onchange: null,
  addListener: vi.fn(),
  removeListener: vi.fn(),
});

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: makeMatchMedia(false),
  });
});

afterEach(() => {
  cleanup();
});

const wikiSource: WikiPageSourceRef = {
  kind: "wiki-page",
  pageId: "p1",
  slug: "leave-policy",
  title: "휴가 정책",
  path: "wiki/ws/auto/concepts/leave-policy.md",
  sensitivity: "PUBLIC",
  citation: "[[leave-policy]]",
  origin: "shortlist",
  confidence: 0.9,
};

describe("AnswerBody", () => {
  it("[[slug]] citation은 sources에 있으면 ClaimBadge로 렌더", () => {
    render(
      <AnswerBody
        text="휴가는 [[leave-policy]]에 따른다."
        sources={[wikiSource]}
        workspaceId="ws-1"
      />,
    );
    // ClaimBadge는 sourceNumber=1을 노출
    expect(screen.getByText(/1/)).toBeInTheDocument();
    // raw [[leave-policy]] 텍스트는 노출되지 않아야 함
    expect(screen.queryByText("[[leave-policy]]")).toBeNull();
  });

  it("[[slug]]가 sources에 없으면 wiki link로 fallback", () => {
    render(
      <AnswerBody
        text="휴가는 [[unknown-page]]를 참고."
        sources={[]}
        workspaceId="ws-1"
      />,
    );
    const link = screen.getByRole("link", { name: "unknown-page" });
    expect(link).toHaveAttribute("href", "/wiki/ws-1/unknown-page");
  });

  it("[source:N] legacy citation도 처리", () => {
    const textSource: SourceRef = {
      kind: "text",
      pageId: "p2",
      title: "정책",
      url: "/k/p2",
      excerpt: "내용",
      confidence: 0.8,
    };
    render(
      <AnswerBody
        text="규정은 [source:1]에 명시."
        sources={[textSource]}
        workspaceId="ws-1"
      />,
    );
    expect(screen.queryByText("[source:1]")).toBeNull();
  });

  it("citation이 전혀 없으면 텍스트 그대로", () => {
    render(
      <AnswerBody
        text="안녕하세요"
        sources={[]}
        workspaceId="ws-1"
      />,
    );
    expect(screen.getByText("안녕하세요")).toBeInTheDocument();
  });
});
