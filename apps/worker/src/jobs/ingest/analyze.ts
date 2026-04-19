/**
 * Step A — Analysis LLM call for the W2 wiki two-step ingest pipeline.
 *
 * Input  : raw source text (post-PII redaction) + workspaceId
 * Output : { analysis, existingPages, indexMd } passed to Step B
 *
 * Behaviour:
 *  - Loads `wiki/{workspaceId}/index.md` from disk (empty string if missing).
 *  - Shortlists 10~15 candidate pages from `wiki_page_index` using
 *    title ILIKE / aliases overlap. Then reads their on-disk markdown so the
 *    LLM can reason about *content*, not just titles.
 *  - Calls the Analysis LLM with the canonical `buildAnalysisPrompt` prompt.
 *  - Parses the JSON response — failures bubble up so processIngest can
 *    route to ingest_dlq.
 */

import { promises as fs } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { ilike, eq, and, sql } from "drizzle-orm";

import { db } from "@jarvis/db/client";
import { wikiPageIndex } from "@jarvis/db/schema/wiki-page-index";
import { callChatWithFallback } from "@jarvis/ai/breaker";
import {
  buildAnalysisPrompt,
  MAX_EXISTING_PAGES,
  type AnalysisResult,
  type ExistingPage,
} from "@jarvis/wiki-agent";
import { readUtf8, exists } from "@jarvis/wiki-fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// apps/worker/src/jobs/ingest/analyze.ts → repo root
const REPO_ROOT = path.resolve(__dirname, "../../../../../");

export interface AnalyzeInput {
  rawSourceId: string;
  workspaceId: string;
  safeText: string;
  /** Optional source filename for prompt provenance / debugging. */
  sourceFileName?: string;
  /** Optional folder context (e.g. "policies/hr"). */
  folderContext?: string;
}

export interface AnalyzeOutput {
  analysis: AnalysisResult;
  /** Shortlisted existing pages passed both to Step A and Step B. */
  existingPages: ExistingPage[];
  /** Current `index.md` text (empty string when missing). */
  indexMd: string;
  /** Sub-map of `existingPages.path → on-disk markdown` for downstream validate. */
  candidateContent: Record<string, string>;
}

const INGEST_MODEL = process.env["INGEST_AI_MODEL"] ?? "gpt-5.4-mini";

/**
 * Build the workspace-relative wiki repo root.
 * `wiki/{workspaceId}/...` is rooted at the monorepo root.
 */
export function wikiWorkspaceRoot(workspaceId: string): string {
  return path.join(REPO_ROOT, "wiki", workspaceId);
}

/**
 * Load `wiki/{workspaceId}/index.md`. Returns "" if file does not exist.
 */
async function loadIndexMd(workspaceId: string): Promise<string> {
  const indexPath = path.join(wikiWorkspaceRoot(workspaceId), "index.md");
  if (!(await exists(indexPath))) return "";
  return readUtf8(indexPath);
}

/**
 * Tokenize `safeText` into a small set of distinctive keywords for ILIKE
 * shortlisting. Removes 1-char tokens, dedupes, caps at 12 to keep the
 * SQL clause bounded.
 */
function extractKeywords(safeText: string): string[] {
  const tokens = safeText
    .replace(/[\u3000\s\n\r\t]+/g, " ")
    .split(" ")
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && t.length <= 30);
  // Heuristic — keep tokens that contain Korean OR look "noun-ish" (Capitalized).
  const distinctive = tokens.filter((t) =>
    /[\uAC00-\uD7AF]/.test(t) || /^[A-Z][a-zA-Z0-9_-]+$/.test(t),
  );
  const dedup = Array.from(new Set(distinctive));
  return dedup.slice(0, 12);
}

/**
 * Fetch candidate pages from `wiki_page_index` using title/slug/aliases match.
 * Capped at MAX_EXISTING_PAGES (=15).
 */
async function shortlistCandidates(
  workspaceId: string,
  keywords: string[],
): Promise<ExistingPage[]> {
  if (keywords.length === 0) {
    // Fallback: most-recent N pages so the prompt is never starved entirely.
    const rows = await db
      .select({
        path: wikiPageIndex.path,
        title: wikiPageIndex.title,
        frontmatter: wikiPageIndex.frontmatter,
      })
      .from(wikiPageIndex)
      .where(eq(wikiPageIndex.workspaceId, workspaceId))
      .orderBy(sql`${wikiPageIndex.updatedAt} DESC`)
      .limit(MAX_EXISTING_PAGES);
    return rows.map(rowToExistingPage);
  }

  // Build OR-of-ILIKEs over title using parameterized inputs.
  const titleConds = keywords.map((kw) => ilike(wikiPageIndex.title, `%${kw}%`));
  // aliases match — frontmatter->aliases is jsonb array.
  // Use `?|` operator with a text[] built via drizzle parameter binding
  // (no sql.raw of user data → no SQL injection surface).
  // `jsonb ?| text[]` checks if ANY of the array's keys exist as top-level
  // elements of the JSONB array, which matches our alias semantics.
  const aliasCond = sql`${wikiPageIndex.frontmatter} -> 'aliases' ?| ${keywords}::text[]`;
  const rows = await db
    .select({
      path: wikiPageIndex.path,
      title: wikiPageIndex.title,
      frontmatter: wikiPageIndex.frontmatter,
    })
    .from(wikiPageIndex)
    .where(
      and(
        eq(wikiPageIndex.workspaceId, workspaceId),
        sql`(${sql.join(titleConds, sql` OR `)} OR ${aliasCond})`,
      ),
    )
    .limit(MAX_EXISTING_PAGES);

  return rows.map(rowToExistingPage);
}

function rowToExistingPage(row: {
  path: string;
  title: string;
  frontmatter: Record<string, unknown>;
}): ExistingPage {
  // The prompt's `summary` field is optional; pull it from frontmatter.summary
  // when present, otherwise fall back to a short alias join.
  const summary =
    typeof row.frontmatter["summary"] === "string"
      ? (row.frontmatter["summary"] as string)
      : Array.isArray(row.frontmatter["aliases"])
        ? (row.frontmatter["aliases"] as unknown[])
            .filter((a): a is string => typeof a === "string")
            .slice(0, 4)
            .join(", ")
        : undefined;
  const out: ExistingPage = { path: row.path, title: row.title };
  if (summary && summary.trim().length > 0) out.summary = summary.trim().slice(0, 400);
  return out;
}

/**
 * Read each candidate page's on-disk markdown so Step C can compare against
 * proposed updates without re-loading from disk.
 */
async function loadCandidateContent(
  pages: ExistingPage[],
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const page of pages) {
    const abs = path.join(REPO_ROOT, page.path);
    if (!(await exists(abs))) continue;
    try {
      out[page.path] = await readUtf8(abs);
    } catch {
      // Skip unreadable pages — projection may have drifted from disk.
    }
  }
  return out;
}

/**
 * Step A entrypoint — runs the Analysis LLM and returns the parsed
 * `AnalysisResult` plus shortlisted existing pages for Step B.
 */
export async function analyze(input: AnalyzeInput): Promise<AnalyzeOutput> {
  const { workspaceId, safeText, sourceFileName, folderContext } = input;

  const indexMd = await loadIndexMd(workspaceId);
  const keywords = extractKeywords(safeText);
  const existingPages = await shortlistCandidates(workspaceId, keywords);
  const candidateContent = await loadCandidateContent(existingPages);

  const analysisPromptInput: Parameters<typeof buildAnalysisPrompt>[0] = {
    source: safeText,
    existingPages,
  };
  if (sourceFileName !== undefined) analysisPromptInput.sourceFileName = sourceFileName;
  if (folderContext !== undefined) analysisPromptInput.folderContext = folderContext;
  const messages = buildAnalysisPrompt(analysisPromptInput);

  // Phase-W1.5 — gateway-aware (FEATURE_SUBSCRIPTION_INGEST) with circuit
  // breaker fallback to OPENAI_API_KEY direct on 3 consecutive failures.
  const resp = await callChatWithFallback("ingest", {
    model: INGEST_MODEL,
    temperature: 0,
    response_format: { type: "json_object" },
    messages,
  });

  const raw = resp.choices[0]?.message?.content ?? "{}";
  let analysis: AnalysisResult;
  try {
    const parsed = JSON.parse(raw) as Partial<AnalysisResult>;
    analysis = {
      keyEntities: Array.isArray(parsed.keyEntities) ? parsed.keyEntities : [],
      keyConcepts: Array.isArray(parsed.keyConcepts) ? parsed.keyConcepts : [],
      findings: Array.isArray(parsed.findings) ? parsed.findings : [],
      contradictions: Array.isArray(parsed.contradictions) ? parsed.contradictions : [],
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
    };
  } catch (err) {
    throw new Error(
      `[ingest:analyze] LLM returned non-JSON for rawSourceId=${input.rawSourceId}: ${String(err)}`,
    );
  }

  // Mark indexMd as consumed for log-line attribution; not embedded in prompt
  // because buildAnalysisPrompt already renders existingPages from the projection.
  void indexMd;

  return { analysis, existingPages, indexMd, candidateContent };
}
