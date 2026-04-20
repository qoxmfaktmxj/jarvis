/**
 * packages/ai/page-first/llm-shortlist.ts
 *
 * Phase-γ T9 — LLM-driven page selection (C 설계 Step 3-4).
 * Catalog + 질문 → LLM이 "이 5-8 페이지 읽겠다" 선택. Zod validation +
 * hallucination filter. fallback=true면 index.ts에서 legacyLexicalShortlist 경유.
 */
import { z } from "zod";
import { getProvider, resolveModel } from "../provider.js";
import type { CatalogRow } from "./catalog.js";

export const PAGE_FIRST_SHORTLIST_PROMPT_VERSION = "v1" as const;

export interface SelectPagesOpts {
  question: string;
  catalog: CatalogRow[];
  graphifySummary?: string;
  maxPages?: number;
}

export interface SelectPagesResult {
  pages: string[];
  reasoning: string;
  fallback: boolean;
  hallucinationCount: number;
  via: "gateway" | "direct" | "fallback";
}

const ResponseSchema = z.object({
  pages: z.array(z.string()).min(1).max(15),
  reasoning: z.string().max(1000),
});

function compactCatalog(catalog: CatalogRow[]): string {
  return catalog
    .map((r) => {
      const aliases =
        r.aliases.length > 0 ? ` [${r.aliases.slice(0, 5).join(", ")}]` : "";
      const snippet = r.snippet ? ` — ${r.snippet.slice(0, 120)}` : "";
      return `\`${r.slug}\`${aliases}${snippet}`;
    })
    .join("\n");
}

function buildPrompt(opts: SelectPagesOpts): string {
  const max = opts.maxPages ?? 8;
  const graphify = opts.graphifySummary
    ? `\n\n== Graphify code-graph module summaries ==\n${opts.graphifySummary}\n`
    : "";
  return `You are the Jarvis wiki navigator. Select 2-${max} pages from the catalog that are most likely to answer the user's question. Consider aliases (synonyms; e.g. 빙부상 = 처부모상), snippets, and wikilink hubs.

Question: ${opts.question}

Catalog (${opts.catalog.length} pages):
${compactCatalog(opts.catalog)}
${graphify}
Return ONLY JSON, no prose:
{ "pages": ["slug1","slug2",...], "reasoning": "1-2 sentences" }`;
}

export async function selectPages(
  opts: SelectPagesOpts,
): Promise<SelectPagesResult> {
  const { client, via } = getProvider("query");
  const model = resolveModel("query");
  const slugsInCatalog = new Set(opts.catalog.map((r) => r.slug));

  let raw: string | null;
  try {
    const res = await client.chat.completions.create({
      model,
      messages: [{ role: "user", content: buildPrompt(opts) }],
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_completion_tokens: 800,
    });
    raw = res.choices[0]?.message?.content ?? null;
  } catch {
    return {
      pages: [],
      reasoning: "LLM call failed",
      fallback: true,
      hallucinationCount: 0,
      via: "fallback",
    };
  }

  if (!raw) {
    return {
      pages: [],
      reasoning: "Empty",
      fallback: true,
      hallucinationCount: 0,
      via: "fallback",
    };
  }

  let parsed: z.infer<typeof ResponseSchema>;
  try {
    parsed = ResponseSchema.parse(JSON.parse(raw));
  } catch {
    return {
      pages: [],
      reasoning: "Parse fail",
      fallback: true,
      hallucinationCount: 0,
      via: "fallback",
    };
  }

  const validPages = parsed.pages.filter((s) => slugsInCatalog.has(s));
  return {
    pages: validPages,
    reasoning: parsed.reasoning,
    fallback: validPages.length < 2,
    hallucinationCount: parsed.pages.length - validPages.length,
    via,
  };
}
