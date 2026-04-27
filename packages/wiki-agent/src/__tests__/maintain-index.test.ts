// packages/wiki-agent/src/__tests__/maintain-index.test.ts
//
// Phase C1 — wiki/index.md 를 생성하는 buildIndexMarkdown 의 단위 테스트.
// wiki-agent 는 pure (network/filesystem I/O 없음) 이므로 본 함수 역시
// 입력 = 페이지 메타 리스트, 출력 = 문자열 만 책임진다. 파일 쓰기는
// caller(wiki-fs) 담당.

import { describe, expect, it } from "vitest";
import {
  buildIndexMarkdown,
  type WikiPageMeta,
} from "../maintain-index.js";

const base: Omit<WikiPageMeta, "slug" | "path" | "title"> = {
  sensitivity: "INTERNAL",
};

function page(p: Partial<WikiPageMeta> & Pick<WikiPageMeta, "slug" | "path" | "title">): WikiPageMeta {
  return { ...base, ...p };
}

describe("buildIndexMarkdown", () => {
  it("produces frontmatter with generated_at + page_count + workspace", () => {
    const md = buildIndexMarkdown(
      [page({ slug: "a", title: "A", path: "wiki/jarvis/manual/a.md" })],
      { generatedAt: new Date("2026-04-23T12:00:00Z"), workspaceCode: "jarvis" },
    );
    expect(md.startsWith("---\n")).toBe(true);
    expect(md).toContain("generated_at: 2026-04-23T12:00:00.000Z");
    expect(md).toContain("page_count: 1");
    expect(md).toContain("workspace: jarvis");
  });

  it("groups pages by top-level category under wiki/<code>/", () => {
    const md = buildIndexMarkdown(
      [
        page({ slug: "m1", title: "정책", path: "wiki/jarvis/manual/policies/m1.md" }),
        page({ slug: "a1", title: "자동 합성", path: "wiki/jarvis/auto/syntheses/a1.md" }),
        page({ slug: "p1", title: "절차", path: "wiki/jarvis/procedures/p1.md" }),
        page({ slug: "r1", title: "참고", path: "wiki/jarvis/references/r1.md" }),
      ],
      { workspaceCode: "jarvis" },
    );
    expect(md).toContain("## 수동 작성 (manual)");
    expect(md).toContain("## 자동 생성 (auto)");
    expect(md).toContain("## 절차 (procedures)");
    expect(md).toContain("## 참고 자료 (references)");
  });

  it("renders each page as `- [[slug]] — title — summary` line", () => {
    const md = buildIndexMarkdown(
      [
        page({
          slug: "loan-interest-limit",
          title: "사내대출 이자 한도",
          path: "wiki/jarvis/manual/policies/loan-interest-limit.md",
          summary: "연 2.5%, 무주택 0.5%p 우대",
        }),
      ],
      { workspaceCode: "jarvis" },
    );
    expect(md).toContain("- [[loan-interest-limit]] — 사내대출 이자 한도 — 연 2.5%, 무주택 0.5%p 우대");
  });

  it("omits ' — summary' suffix when summary is empty or missing", () => {
    const md = buildIndexMarkdown(
      [page({ slug: "a", title: "A", path: "wiki/jarvis/manual/a.md" })],
      { workspaceCode: "jarvis" },
    );
    expect(md).toContain("- [[a]] — A\n");
    expect(md).not.toContain("A — \n");
  });

  it("sorts pages alphabetically by title within each category", () => {
    const md = buildIndexMarkdown(
      [
        page({ slug: "b", title: "나중", path: "wiki/jarvis/manual/b.md" }),
        page({ slug: "a", title: "먼저", path: "wiki/jarvis/manual/a.md" }),
      ],
      { workspaceCode: "jarvis" },
    );
    const manualSection = md.slice(md.indexOf("## 수동 작성"));
    const aIdx = manualSection.indexOf("[[a]]");
    const bIdx = manualSection.indexOf("[[b]]");
    expect(bIdx).toBeLessThan(aIdx); // "나중" < "먼저" sort by Korean title
  });

  it("puts pages under an unrecognized path into '기타'", () => {
    const md = buildIndexMarkdown(
      [page({ slug: "root", title: "루트", path: "wiki/jarvis/root.md" })],
      { workspaceCode: "jarvis" },
    );
    expect(md).toContain("## 기타 (other)");
    expect(md).toContain("[[root]]");
  });

  it("includes per-category count in heading", () => {
    const md = buildIndexMarkdown(
      [
        page({ slug: "m1", title: "A", path: "wiki/jarvis/manual/x.md" }),
        page({ slug: "m2", title: "B", path: "wiki/jarvis/manual/y.md" }),
        page({ slug: "a1", title: "Z", path: "wiki/jarvis/auto/z.md" }),
      ],
      { workspaceCode: "jarvis" },
    );
    expect(md).toContain("## 수동 작성 (manual) — 2");
    expect(md).toContain("## 자동 생성 (auto) — 1");
  });

  it("skips empty categories", () => {
    const md = buildIndexMarkdown(
      [page({ slug: "m1", title: "A", path: "wiki/jarvis/manual/x.md" })],
      { workspaceCode: "jarvis" },
    );
    expect(md).not.toContain("## 자동 생성");
    expect(md).not.toContain("## 절차");
  });

  it("returns a valid 'empty wiki' document when pages is empty", () => {
    const md = buildIndexMarkdown([], { workspaceCode: "jarvis" });
    expect(md).toContain("page_count: 0");
    expect(md).toContain("(페이지 없음)");
  });
});
