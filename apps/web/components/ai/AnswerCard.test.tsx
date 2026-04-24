import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import type { WikiPageSourceRef } from "@jarvis/ai/types";
import { AnswerCard } from "./AnswerCard";
// Note: Next.js Link renders as <a> in renderToStaticMarkup context.

function wikiSource(overrides: Partial<WikiPageSourceRef> & { slug: string }): WikiPageSourceRef {
  return {
    kind: "wiki-page",
    pageId: `p-${overrides.slug}`,
    path: `wiki/${overrides.slug}.md`,
    title: `title-${overrides.slug}`,
    sensitivity: "PUBLIC",
    citation: `[[${overrides.slug}]]`,
    origin: "shortlist",
    confidence: 0.9,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Task B4 — [[slug]] citation rendering in answer body
// ---------------------------------------------------------------------------
describe("AnswerCard — [[slug]] citation rendering (Phase B4)", () => {
  it("renders [[slug]] as a ClaimBadge when slug matches a wiki-page source", () => {
    const sources: WikiPageSourceRef[] = [
      wikiSource({ slug: "jarvis-intro", confidence: 0.9, title: "Jarvis 소개" }),
    ];
    const html = renderToStaticMarkup(
      <AnswerCard answer="Jarvis에 대해 [[jarvis-intro]] 참고하세요." sources={sources} />,
    );
    // ClaimBadge should be rendered (renders a sup element)
    expect(html).toContain("<sup>");
    // The raw [[jarvis-intro]] text should not appear verbatim
    expect(html).not.toContain("[[jarvis-intro]]");
  });

  it("renders unknown [[slug]] as a plain link when not in sources", () => {
    const sources: WikiPageSourceRef[] = [
      wikiSource({ slug: "known", confidence: 0.9, title: "Known" }),
    ];
    const html = renderToStaticMarkup(
      <AnswerCard answer="이것은 [[unknown-page]] 링크입니다." sources={sources} />,
    );
    // Should render as a link to /wiki/default/unknown-page
    expect(html).toContain("unknown-page");
    expect(html).not.toContain("[[unknown-page]]");
  });

  it("renders legacy [source:N] alongside [[slug]] citations", () => {
    const sources: WikiPageSourceRef[] = [
      wikiSource({ slug: "alpha", confidence: 0.9, title: "Alpha" }),
    ];
    const html = renderToStaticMarkup(
      <AnswerCard answer="결과 [source:1] 그리고 [[alpha]] 확인." sources={sources} />,
    );
    // Both citations should produce sup elements
    const supCount = (html.match(/<sup/g) ?? []).length;
    expect(supCount).toBeGreaterThanOrEqual(2);
    expect(html).not.toContain("[source:1]");
    expect(html).not.toContain("[[alpha]]");
  });

  it("renders multiple [[slug]] citations in answer body", () => {
    const sources: WikiPageSourceRef[] = [
      wikiSource({ slug: "pageA", confidence: 0.9, title: "Page A" }),
      wikiSource({ slug: "pageB", confidence: 0.85, title: "Page B" }),
    ];
    const html = renderToStaticMarkup(
      <AnswerCard answer="A는 [[pageA]] B는 [[pageB]] 참고." sources={sources} />,
    );
    const supCount = (html.match(/<sup/g) ?? []).length;
    expect(supCount).toBe(2);
    expect(html).not.toContain("[[pageA]]");
    expect(html).not.toContain("[[pageB]]");
  });
});

describe("AnswerCard — WikiPageSection", () => {
  it("hides wiki-page sources with confidence below 0.65", () => {
    const sources = [
      wikiSource({ slug: "high", confidence: 0.9, title: "VisibleHigh" }),
      wikiSource({ slug: "medium", confidence: 0.7, title: "VisibleMedium" }),
      wikiSource({ slug: "low", confidence: 0.4, title: "HiddenLow" }),
    ];
    const html = renderToStaticMarkup(<AnswerCard answer="answer text" sources={sources} />);
    expect(html).toContain("VisibleHigh");
    expect(html).toContain("VisibleMedium");
    expect(html).not.toContain("HiddenLow");
  });

  it("does not render [[slug]] citation labels in the wiki-page list", () => {
    const sources = [
      wikiSource({ slug: "alpha", confidence: 0.9, title: "AlphaTitle" }),
    ];
    const html = renderToStaticMarkup(<AnswerCard answer="answer" sources={sources} />);
    expect(html).not.toContain("[[alpha]]");
    expect(html).toContain("AlphaTitle");
    expect(html).toContain("wiki/alpha.md");
  });

  it("hides the entire wiki-page section when every source is low confidence", () => {
    const sources = [
      wikiSource({ slug: "a", confidence: 0.3, title: "HiddenAlpha" }),
      wikiSource({ slug: "b", confidence: 0.1, title: "HiddenBeta" }),
    ];
    const html = renderToStaticMarkup(<AnswerCard answer="answer" sources={sources} />);
    expect(html).not.toContain("위키 페이지");
    expect(html).not.toContain("HiddenAlpha");
    expect(html).not.toContain("HiddenBeta");
  });

  it("reflects visible count (not total) in the section header", () => {
    const sources = [
      wikiSource({ slug: "a", confidence: 0.9, title: "keepA" }),
      wikiSource({ slug: "b", confidence: 0.2, title: "dropB" }),
      wikiSource({ slug: "c", confidence: 0.7, title: "keepC" }),
    ];
    const html = renderToStaticMarkup(<AnswerCard answer="answer" sources={sources} />);
    expect(html).toContain("keepA");
    expect(html).toContain("keepC");
    expect(html).not.toContain("dropB");
    const match = html.match(/위키 페이지[\s\S]*?>(\d+)</);
    expect(match?.[1]).toBe("2");
  });
});
