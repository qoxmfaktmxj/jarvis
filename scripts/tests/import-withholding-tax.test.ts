import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { parseFrontmatter } from "../../packages/wiki-fs/src/frontmatter.js";
import { importWithholdingTax } from "../import-withholding-tax.js";

function fact(overrides: Record<string, unknown>) {
  return {
    id: "f_ok",
    slug: "ch01.verified.fact",
    title: "확정 자료",
    chapter: "ch1",
    claim: "공식 출처로 검증된 내용이다.",
    lawRef: "소득세법 제1조",
    lawUrl: "https://www.law.go.kr/법령/소득세법/제1조",
    asOf: "2026-06-15",
    effectiveDate: "2026-01-01",
    verifyStatus: "확정",
    primarySourceVerified: true,
    confidenceScore: 95,
    scopeLimitations: "해당 조문 범위에 한정한다.",
    risk: "high",
    ...overrides,
  };
}

describe("importWithholdingTax", () => {
  it("keeps only confirmed facts with primary verification and official URLs", async () => {
    const sandbox = await mkdtemp(join(tmpdir(), "jarvis-withholding-import-"));
    const sourceRoot = join(sandbox, "source");
    const outputRoot = join(sandbox, "output");
    await mkdir(join(sourceRoot, "content"), { recursive: true });
    await writeFile(
      join(sourceRoot, "content", "facts.json"),
      JSON.stringify([
        fact({}),
        fact({ id: "f_lecture", slug: "lecture.fact", verifyStatus: "강의기반" }),
        fact({ id: "f_secondary", slug: "secondary.fact", lawUrl: "https://example.com/article" }),
        fact({ id: "f_unverified", slug: "unverified.fact", primarySourceVerified: false }),
      ]),
    );

    const result = await importWithholdingTax({
      sourceRoot,
      outputRoot,
      sourceRevision: "abc123",
    });

    expect(result).toMatchObject({ total: 4, imported: 1, excluded: 3 });
    const pages = await readdir(join(outputRoot, "samples", "wiki", "manual", "notes", "withholding-tax"));
    expect(pages).toEqual(["withholding-ch01-verified-fact-f-ok.md"]);
    const page = await readFile(
      join(outputRoot, "samples", "wiki", "manual", "notes", "withholding-tax", pages[0]!),
      "utf8",
    );
    expect(page).toContain("{{sourceRevisionId:withholding-tax-verified-facts.json}}");
    expect(page).toContain("locator: fact-f-ok");
    expect(page).toContain("https://www.law.go.kr/");

    const snapshot = JSON.parse(
      await readFile(join(outputRoot, "samples", "sources", "withholding-tax-verified-facts.json"), "utf8"),
    ) as { factCount: number; normalizedText: string };
    expect(snapshot.factCount).toBe(1);
    expect(snapshot.normalizedText).toContain("fact-f-ok");
    expect(snapshot.normalizedText).not.toContain("lecture.fact");
  });

  it("keeps the tracked 208-page corpus aligned with its source snapshot", async () => {
    const snapshot = JSON.parse(
      await readFile(join(process.cwd(), "samples", "sources", "withholding-tax-verified-facts.json"), "utf8"),
    ) as { factCount: number; facts: Array<{ id: string }> };
    const pagesRoot = join(process.cwd(), "samples", "wiki", "manual", "notes", "withholding-tax");
    const pages = (await readdir(pagesRoot)).filter((name) => name.endsWith(".md"));
    const expectedLocators = new Set(
      snapshot.facts.map((fact) => `fact-${fact.id.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`),
    );
    const actualLocators = new Set<string>();

    for (const page of pages) {
      const template = await readFile(join(pagesRoot, page), "utf8");
      const hydrated = template.replace(
        "{{sourceRevisionId:withholding-tax-verified-facts.json}}",
        "550e8400-e29b-41d4-a716-446655440000",
      );
      const parsed = parseFrontmatter(hydrated);
      expect(parsed.data.publishedStatus).toBe("published");
      expect(parsed.data.sources).toHaveLength(1);
      expect(parsed.body).toContain("공식 출처: [원문 확인](https://");
      actualLocators.add(parsed.data.sources[0]!.locator);
    }

    expect(snapshot.factCount).toBe(208);
    expect(pages).toHaveLength(208);
    expect(actualLocators).toEqual(expectedLocators);
  });
});
