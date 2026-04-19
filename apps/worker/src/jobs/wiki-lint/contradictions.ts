/**
 * apps/worker/src/jobs/wiki-lint/contradictions.ts
 *
 * Phase-W2 T3 — semantic contradiction detection (WIKI-AGENTS.md §3.3).
 *
 * Only this check uses an LLM. Every other lint rule is lexical/DB-based.
 * The flow:
 *   1. Enumerate page pairs that share ≥1 tag or alias (candidate space).
 *   2. For each candidate pair, fetch disk body via `readPage` (wiki-fs).
 *   3. Call gpt-5.4-mini with a compact contradiction prompt.
 *   4. Keep only confidence ≥ 0.7.
 *
 * To keep cost bounded we cap candidates per workspace at `MAX_PAIRS`.
 * When the candidate pool is larger, we sample the most recently updated
 * pages first (heuristic: drift is more likely in active pages).
 */

import { db } from "@jarvis/db/client";
import { wikiPageIndex } from "@jarvis/db/schema/wiki-page-index";
import { readPage } from "@jarvis/wiki-fs";
import { and, desc, eq, sql } from "drizzle-orm";
import OpenAI from "openai";
import { getProvider } from "@jarvis/ai/provider";

const CONTRADICTION_MODEL =
  process.env["LINT_CONTRADICTION_MODEL"] ?? "gpt-5.4-mini";
const MIN_CONFIDENCE = 0.7;
const MAX_PAIRS = Number.parseInt(
  process.env["LINT_CONTRADICTION_MAX_PAIRS"] ?? "30",
  10,
);
const MAX_BODY_CHARS = 2000;

export interface ContradictionFinding {
  pageA: { id: string; path: string; title: string };
  pageB: { id: string; path: string; title: string };
  description: string;
  confidence: number;
}

interface PageRow {
  id: string;
  path: string;
  title: string;
  slug: string;
  tags: string[];
  aliases: string[];
}

export interface DetectContradictionsDeps {
  openai?: OpenAI | null;
  /** Inject to skip LLM in tests. */
  judgePair?: (
    a: { body: string; title: string },
    b: { body: string; title: string },
  ) => Promise<{ description: string; confidence: number } | null>;
}

/**
 * Detect contradictions in `workspaceId`. Returns findings with confidence
 * ≥ 0.7. LLM calls are serialized to keep rate/cost predictable.
 */
export async function detectContradictions(
  workspaceId: string,
  deps: DetectContradictionsDeps = {},
): Promise<ContradictionFinding[]> {
  const pages = await loadCandidatePages(workspaceId);
  if (pages.length < 2) return [];

  const pairs = buildCandidatePairs(pages).slice(0, MAX_PAIRS);
  if (pairs.length === 0) return [];

  // Phase-W1.5 — gateway-aware client (FEATURE_SUBSCRIPTION_LINT) when no
  // explicit `deps.openai` injection. Tests still pass `deps.openai` or
  // `deps.judgePair` to bypass the network entirely.
  const openai =
    deps.openai ??
    (deps.judgePair ? null : getProvider("lint").client);

  const findings: ContradictionFinding[] = [];
  for (const [a, b] of pairs) {
    const bodyA = await safeReadBody(workspaceId, a.path);
    const bodyB = await safeReadBody(workspaceId, b.path);
    if (bodyA === null || bodyB === null) continue;

    const judge = deps.judgePair
      ? deps.judgePair(
          { body: bodyA, title: a.title },
          { body: bodyB, title: b.title },
        )
      : callLlmJudge(openai, a, bodyA, b, bodyB);

    const verdict = await judge;
    if (!verdict) continue;
    if (verdict.confidence < MIN_CONFIDENCE) continue;

    findings.push({
      pageA: { id: a.id, path: a.path, title: a.title },
      pageB: { id: b.id, path: b.path, title: b.title },
      description: verdict.description,
      confidence: verdict.confidence,
    });
  }

  return findings;
}

// ── helpers ──────────────────────────────────────────────────────────────

async function loadCandidatePages(workspaceId: string): Promise<PageRow[]> {
  // Pull pages + aliases + tags. We pick recently updated pages to focus
  // LLM budget where drift is most likely.
  const rows = await db
    .select({
      id: wikiPageIndex.id,
      path: wikiPageIndex.path,
      title: wikiPageIndex.title,
      slug: wikiPageIndex.slug,
      frontmatter: wikiPageIndex.frontmatter,
      type: wikiPageIndex.type,
    })
    .from(wikiPageIndex)
    .where(
      and(
        eq(wikiPageIndex.workspaceId, workspaceId),
        eq(wikiPageIndex.publishedStatus, "published"),
        eq(wikiPageIndex.stale, false),
        sql`${wikiPageIndex.type} IN ('entity','concept','synthesis')`,
      ),
    )
    .orderBy(desc(wikiPageIndex.updatedAt))
    .limit(200);

  return rows.map((r) => {
    const fm = r.frontmatter as Record<string, unknown>;
    const tags = Array.isArray(fm["tags"])
      ? (fm["tags"] as unknown[]).filter((x): x is string => typeof x === "string")
      : [];
    const aliases = Array.isArray(fm["aliases"])
      ? (fm["aliases"] as unknown[]).filter(
          (x): x is string => typeof x === "string",
        )
      : [];
    return {
      id: r.id,
      path: r.path,
      title: r.title,
      slug: r.slug,
      tags,
      aliases,
    };
  });
}

/**
 * Pair pages that share at least one tag or alias. Each pair is emitted
 * once (i<j). Exposed for unit tests.
 */
export function buildCandidatePairs(pages: PageRow[]): Array<[PageRow, PageRow]> {
  const pairs: Array<[PageRow, PageRow]> = [];
  for (let i = 0; i < pages.length; i++) {
    const a = pages[i]!;
    const aTags = new Set(a.tags);
    const aAliases = new Set(a.aliases.map((s) => s.toLowerCase()));
    for (let j = i + 1; j < pages.length; j++) {
      const b = pages[j]!;
      const tagOverlap = b.tags.some((t) => aTags.has(t));
      const aliasOverlap = b.aliases.some((al) =>
        aAliases.has(al.toLowerCase()),
      );
      if (tagOverlap || aliasOverlap) {
        pairs.push([a, b]);
      }
    }
  }
  return pairs;
}

async function safeReadBody(
  workspaceId: string,
  repoRelativePath: string,
): Promise<string | null> {
  try {
    const content = await readPage(workspaceId, repoRelativePath);
    return content.slice(0, MAX_BODY_CHARS);
  } catch (err) {
    console.warn(
      `[wiki-lint.contradictions] skip (read fail): ${repoRelativePath} — ${String(err)}`,
    );
    return null;
  }
}

async function callLlmJudge(
  openai: OpenAI | null,
  a: PageRow,
  bodyA: string,
  b: PageRow,
  bodyB: string,
): Promise<{ description: string; confidence: number } | null> {
  if (!openai) return null;

  const prompt = buildContradictionPrompt(
    { title: a.title, body: bodyA },
    { title: b.title, body: bodyB },
  );

  try {
    const resp = await openai.chat.completions.create({
      model: CONTRADICTION_MODEL,
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
      response_format: { type: "json_object" },
    });

    const text = resp.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(text) as {
      contradiction?: boolean;
      description?: string;
      confidence?: number;
    };

    if (!parsed.contradiction) return null;
    const confidence =
      typeof parsed.confidence === "number"
        ? Math.max(0, Math.min(1, parsed.confidence))
        : 0;
    const description =
      typeof parsed.description === "string" ? parsed.description : "";
    if (!description) return null;
    return { description, confidence };
  } catch (err) {
    console.warn(
      `[wiki-lint.contradictions] LLM call failed for ${a.slug} ↔ ${b.slug}: ${String(err)}`,
    );
    return null;
  }
}

function buildContradictionPrompt(
  a: { title: string; body: string },
  b: { title: string; body: string },
): { system: string; user: string } {
  return {
    system:
      "You are a wiki quality auditor. Given two pages, decide whether they make directly contradictory factual claims about the same subject. " +
      "Minor differences in emphasis, scope, or date are NOT contradictions. " +
      'Reply with strict JSON of shape: {"contradiction": boolean, "description": string, "confidence": number between 0 and 1}. ' +
      "description should be ≤ 280 chars (Korean OK).",
    user: `# Page A: ${a.title}\n\n${a.body}\n\n---\n\n# Page B: ${b.title}\n\n${b.body}`,
  };
}
