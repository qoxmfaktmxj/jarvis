import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createEvidenceSearcher } from "../index.js";

class CapturingDb {
  query: unknown;

  async execute(query: unknown): Promise<{ rows: [] }> {
    this.query = query;
    return { rows: [] };
  }
}

describe("SQL safety and projection scope", () => {
  it("binds user input as parameters instead of interpolating SQL", async () => {
    const db = new CapturingDb();
    const searcher = createEvidenceSearcher({ db });
    await expect(
      searcher.searchEvidence({
        workspaceId: "11111111-1111-1111-1111-111111111111",
        query: `' OR 1=1 --`,
        asOf: "2026-07-20",
        types: ["wiki", "source", "legal_case"],
        page: 1,
        limit: 10,
      }),
    ).resolves.toEqual([]);

    expect(renderSqlObject(db.query)).not.toContain(`' OR 1=1 --`);
    expect(extractParamValues(db.query)).toContain(`OR 1 1`);
  });

  it("does not reference legacy storage or internal case fields", () => {
    const source = readFileSync(join(process.cwd(), "src", "pg-search.ts"), "utf8");
    expect(source).not.toMatch(forbidden(["knowledge", "_page", "|document", "_chunks", "|embed", "ding"]));
    expect(source).not.toMatch(forbidden(["wiki", "_graph", "_query|graph", "_snapshot|raw ", "chunk"]));
    expect(source).not.toMatch(forbidden(["symp", "tom|root", "_cause|action", "_taken|service", ".?desk|precedent", "_case"]));
    expect(source).not.toMatch(forbidden(["\\bbo", "dy\\b|cont", "ent|mdx", "Content"]));
  });
});

function forbidden(parts: string[]): RegExp {
  return new RegExp(parts.join(""), "i");
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
