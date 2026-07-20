import { describe, expect, it } from "vitest";
import { createEvidenceSearcher } from "../index.js";
import type { EvidenceSearchHit } from "../index.js";

class FakeSearchDb {
  calls: unknown[] = [];

  constructor(private readonly rows: EvidenceSearchHit[]) {}

  async execute(query: unknown): Promise<{ rows: EvidenceSearchHit[] }> {
    this.calls.push(query);
    const parameters = extractParamValues(query);
    const take = parameters.at(-2);
    const offset = parameters.at(-1);
    if (typeof take === "number" && typeof offset === "number") {
      return { rows: this.rows.slice(offset, offset + take) };
    }
    return { rows: this.rows };
  }
}

describe("searchEvidence", () => {
  it("excludes non-projectable wiki paths and isolates the workspace in SQL", async () => {
    const db = new FakeSearchDb([
      {
        resourceType: "wiki",
        path: "manual/payroll/average-wage.md",
        title: "평균임금",
        id: "w1",
        snippet: "평균임금 산정",
        score: 1,
        slug: "average-wage",
        sourceRevisionId: null,
        locator: null,
        effectiveFrom: null,
        canonicalUrl: null,
      },
    ]);
    const searcher = createEvidenceSearcher({ db });

    await expect(
      searcher.searchEvidence({
        workspaceId: "11111111-1111-1111-1111-111111111111",
        query: "average wage",
        page: 1,
        limit: 10,
        types: ["wiki"],
      }),
    ).resolves.toEqual([expect.objectContaining({ id: "w1", resourceType: "wiki" })]);

    const sqlText = renderSqlObject(db.calls[0]);
    expect(sqlText).toContain("w.workspace_id = args.workspace_id");
    expect(sqlText).toContain("w.zone in ('auto', 'manual')");
    expect(sqlText).toContain("w.published_status = 'published'");
    expect(sqlText).toContain("w.path not like 'auto/_archive/%'");
    expect(sqlText).toContain("w.path not like 'manual/_system/%'");
  });

  it("keeps global rank pagination stable across wiki/source/legal_case rows", async () => {
    const db = new FakeSearchDb([
      hit("legal_case", "case-1", 0.9),
      hit("wiki", "wiki-2", 0.8),
      hit("source", "source-9", 0.7),
      hit("wiki", "wiki-4", 0.6),
    ]);
    const searcher = createEvidenceSearcher({ db });
    const first = await searcher.searchEvidence({
      workspaceId: "11111111-1111-1111-1111-111111111111",
      query: "평균임금",
      page: 1,
      limit: 2,
      types: ["wiki", "source", "legal_case"],
    });
    const second = await searcher.searchEvidence({
      workspaceId: "11111111-1111-1111-1111-111111111111",
      query: "평균임금",
      page: 2,
      limit: 2,
      types: ["wiki", "source", "legal_case"],
    });

    expect(first.map((row) => row.id)).toEqual(["case-1", "wiki-2"]);
    expect(second.map((row) => row.id)).toEqual(["source-9", "wiki-4"]);
    const sqlText = renderSqlObject(db.calls[0]);
    expect(sqlText).toContain("array[");
    expect(sqlText).toContain("order by score desc, sort_date desc nulls last, resource_type asc, id asc");
    expect(extractParamValues(db.calls[0])).toEqual([
      "11111111-1111-1111-1111-111111111111",
      "평균임금",
      "평균임금",
      "wiki",
      "source",
      "legal_case",
      null,
      2,
      0,
    ]);
    expect(extractParamValues(db.calls[1])).toEqual([
      "11111111-1111-1111-1111-111111111111",
      "평균임금",
      "평균임금",
      "wiki",
      "source",
      "legal_case",
      null,
      2,
      2,
    ]);
  });

  it("filters source/legal rows by asOf without affecting wiki hits", async () => {
    const db = new FakeSearchDb([
      hit("wiki", "wiki-current", 0.9),
      { ...hit("source", "source-valid", 0.8), sourceRevisionId: "rev-valid" },
      { ...hit("legal_case", "case-valid", 0.7), sourceRevisionId: "rev-case" },
    ]);
    const searcher = createEvidenceSearcher({ db });
    const hits = await searcher.searchEvidence({
      workspaceId: "11111111-1111-1111-1111-111111111111",
      query: "산재",
      asOf: "2026-01-31",
      types: ["wiki", "source", "legal_case"],
      page: 1,
      limit: 10,
    });

    expect(hits).toEqual([
      expect.objectContaining({ resourceType: "wiki", id: "wiki-current" }),
      expect.objectContaining({ resourceType: "source", id: "source-valid", sourceRevisionId: "rev-valid" }),
      expect.objectContaining({ resourceType: "legal_case", id: "case-valid", sourceRevisionId: "rev-case" }),
    ]);
    expect(extractParamValues(db.calls[0])).toContain("2026-01-31T00:00:00.000Z");
    expect(renderSqlObject(db.calls[0])).toContain("args.as_of is null or");
  });

  it("rejects impossible asOf dates instead of rolling them forward", async () => {
    const db = new FakeSearchDb([]);
    const searcher = createEvidenceSearcher({ db });

    await expect(
      searcher.searchEvidence({
        workspaceId: "11111111-1111-1111-1111-111111111111",
        query: "퇴직금",
        asOf: "2026-02-31",
        types: ["wiki"],
        page: 1,
        limit: 10,
      }),
    ).rejects.toThrow("invalid asOf date");
  });
});

function hit(resourceType: EvidenceSearchHit["resourceType"], id: string, score: number): EvidenceSearchHit {
  return {
    resourceType,
    id,
    title: id,
    snippet: id,
    score,
    slug: resourceType === "wiki" ? id : null,
    path: resourceType === "wiki" ? `manual/${id}.md` : null,
    sourceRevisionId: null,
    locator: resourceType === "legal_case" ? "holding_summary" : null,
    effectiveFrom: null,
    canonicalUrl: null,
  };
}

function renderSqlObject(value: unknown): string {
  const chunks = (value as { queryChunks?: unknown[] } | undefined)?.queryChunks;
  if (!chunks) return String(value);
  return chunks
    .map((chunk) => {
      if (isStringChunk(chunk)) return chunk.value.join("");
      if (Array.isArray(chunk)) return chunk.join("");
      if (typeof chunk === "string") return chunk;
      return renderSqlObject(chunk);
    })
    .join("");
}

function extractParamValues(value: unknown): unknown[] {
  const out: unknown[] = [];
  const chunks = (value as { queryChunks?: unknown[] } | undefined)?.queryChunks ?? [];
  for (const chunk of chunks) {
    if (isStringChunk(chunk)) continue;
    if (hasQueryChunks(chunk)) out.push(...extractParamValues(chunk));
    else out.push(chunk);
  }
  return out;
}

function isStringChunk(value: unknown): value is { value: string[] } {
  return Boolean(value && typeof value === "object" && "value" in value && Array.isArray((value as { value: unknown }).value));
}

function hasQueryChunks(value: unknown): value is { queryChunks: unknown[] } {
  return Boolean(value && typeof value === "object" && "queryChunks" in value);
}
