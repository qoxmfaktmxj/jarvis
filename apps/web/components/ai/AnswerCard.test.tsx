import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import type { WikiPageSourceRef } from "@jarvis/ai/types";
import { AnswerCard } from "./AnswerCard";

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
