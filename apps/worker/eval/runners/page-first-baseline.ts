/**
 * apps/worker/eval/runners/page-first-baseline.ts
 *
 * Phase-W3 v4-W3-T4 — page-first recall@5 baseline runner.
 *
 * Measures page-first recall@5 against `page-qa.jsonl` fixtures.
 *
 * Fixture schema (one JSON per line):
 *   {
 *     "query": string,
 *     "expectedPages": string[],      // wiki_page_index.path (or slug) matches
 *     "answerPatterns": string[],     // reserved: substring checks on synthesized answer
 *     "curatorUserId": string,
 *     "reviewedByUserId": string
 *   }
 *
 * Usage:
 *   tsx apps/worker/eval/runners/page-first-baseline.ts [--output results.md]
 *
 * Modes:
 *   - LIVE: When `EVAL_WORKSPACE_ID` env is set, calls the real `lexicalShortlist`
 *     against a running DB. Requires DB connection + ingested workspace.
 *   - DRY-RUN: When `EVAL_WORKSPACE_ID` is absent, validates fixture structure and
 *     reports baseline recall (0%) for all queries. Useful for CI and fixture QA.
 *
 * Environment variables:
 *   EVAL_WORKSPACE_ID   — workspace UUID (enables live mode)
 *   EVAL_USER_PERMS     — comma-separated permission strings (defaults to "knowledge:read")
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

interface Fixture {
  query: string;
  expectedPages: string[];
  answerPatterns: string[];
  curatorUserId: string;
  reviewedByUserId: string;
}

interface EvalResult {
  query: string;
  expectedPages: string[];
  retrievedPages: string[];
  hit: boolean;
  /** Per-query recall: |expected ∩ retrieved| / |expected|. 1.0 when expectedPages is empty. */
  recall: number;
}

interface EvalSummary {
  mode: "live" | "dry-run";
  total: number;
  hit: number;
  recall5: number;
  results: EvalResult[];
}

const TOP_K = 5;

/**
 * Dynamically import lexicalShortlist only when needed (live mode).
 * This avoids pulling in DB deps when running dry-run in CI.
 */
async function importShortlist() {
  const mod = await import("@jarvis/ai/page-first/shortlist");
  return mod.lexicalShortlist;
}

function parseFixtures(fixturePath: string): Fixture[] {
  const lines = readFileSync(fixturePath, "utf-8")
    .split("\n")
    .filter((l) => l.trim().length > 0);

  return lines.map((l, idx) => {
    try {
      const parsed = JSON.parse(l) as Fixture;
      // Validate required fields
      if (typeof parsed.query !== "string" || !parsed.query.trim()) {
        throw new Error("missing or empty 'query'");
      }
      if (!Array.isArray(parsed.expectedPages)) {
        throw new Error("missing or invalid 'expectedPages'");
      }
      return parsed;
    } catch (err) {
      throw new Error(
        `page-qa.jsonl line ${idx + 1}: invalid fixture — ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  });
}

function computeRecall(expected: string[], retrieved: string[]): number {
  if (expected.length === 0) return 1;
  const retrievedSet = new Set(retrieved);
  const hits = expected.filter((ep) => retrievedSet.has(ep)).length;
  return hits / expected.length;
}

function computeHit(expected: string[], retrieved: string[]): boolean {
  if (expected.length === 0) return true;
  const retrievedSet = new Set(retrieved);
  return expected.some((ep) => retrievedSet.has(ep));
}

export async function runEval(fixturePath: string): Promise<EvalSummary> {
  const fixtures = parseFixtures(fixturePath);

  const workspaceId = process.env["EVAL_WORKSPACE_ID"];
  const userPermissions = (
    process.env["EVAL_USER_PERMS"] ?? "knowledge:read"
  ).split(",");

  const isLive = !!workspaceId;
  const mode = isLive ? "live" : "dry-run";

  let lexicalShortlist:
    | Awaited<ReturnType<typeof importShortlist>>
    | null = null;

  if (isLive) {
    // EVAL_WORKSPACE_ID가 설정된 상태에서 import 실패는 환경 문제이므로 throw.
    // 조용히 dry-run으로 폴백하면 recall@5=0%를 정상 결과로 오해할 수 있다.
    lexicalShortlist = await importShortlist();
  }

  if (!isLive) {
    console.log("[eval] DRY-RUN mode — EVAL_WORKSPACE_ID not set.");
    console.log(
      "[eval] Fixture structure validation only. Set EVAL_WORKSPACE_ID to enable live recall measurement.",
    );
  }

  const results: EvalResult[] = [];

  for (const fixture of fixtures) {
    let retrievedPages: string[] = [];

    if (lexicalShortlist && workspaceId) {
      try {
        const hits = await lexicalShortlist({
          workspaceId,
          userPermissions,
          question: fixture.query,
          topK: TOP_K,
        });
        retrievedPages = hits.map((h) => h.path);
      } catch (err) {
        console.warn(
          `[eval] shortlist failed for query "${fixture.query}":`,
          err instanceof Error ? err.message : err,
        );
        // Keep retrievedPages empty — counts as miss
      }
    }

    const hit = computeHit(fixture.expectedPages, retrievedPages);
    const recall = computeRecall(fixture.expectedPages, retrievedPages);

    results.push({
      query: fixture.query,
      expectedPages: fixture.expectedPages,
      retrievedPages,
      hit,
      recall,
    });
  }

  const total = results.length;
  const hitCount = results.filter((r) => r.hit).length;
  const recall5 = total === 0 ? 0 : hitCount / total;

  return { mode, total, hit: hitCount, recall5, results };
}

function formatReport(summary: EvalSummary): string {
  const { mode, total, hit, recall5, results } = summary;

  return `# Page-First Eval Baseline (${new Date().toISOString().slice(0, 10)})

## 설정

| 항목 | 값 |
|------|-----|
| 모드 | ${mode} |
| Top-K | ${TOP_K} |
| Fixture 수 | ${total} |

## 결과

| 지표 | 값 |
|------|-----|
| 총 쿼리 수 | ${total} |
| Hit 수 | ${hit} |
| Recall@${TOP_K} | ${(recall5 * 100).toFixed(1)}% |
| 목표 | >= 70% (W3 게이트) |

## 상세

${results
  .map(
    (r, i) =>
      `${i + 1}. **${r.query}**\n` +
      `   - expected: [${r.expectedPages.join(", ")}]\n` +
      `   - retrieved: [${r.retrievedPages.join(", ")}]\n` +
      `   - hit=${r.hit}, recall=${r.recall.toFixed(2)}`,
  )
  .join("\n")}
`;
}

function printConsoleSummary(summary: EvalSummary): void {
  console.log("---");
  console.log(`mode: ${summary.mode}`);
  console.log(
    `total: ${summary.total}, hit: ${summary.hit}, recall@5: ${summary.recall5.toFixed(2)}`,
  );
  console.log("---");
}

async function main(): Promise<void> {
  const fixturePath = join(
    process.cwd(),
    "apps/worker/eval/fixtures/2026-04/page-qa.jsonl",
  );

  const summary = await runEval(fixturePath);

  const outputIdx = process.argv.indexOf("--output");
  const outputPath =
    outputIdx !== -1 && process.argv[outputIdx + 1]
      ? process.argv[outputIdx + 1]!
      : "eval-baseline.md";

  const report = formatReport(summary);
  writeFileSync(outputPath, report, "utf-8");

  printConsoleSummary(summary);
  console.log(`Report written to ${outputPath}`);
}

// Only auto-run when invoked as a script (not when imported by tests).
const invokedDirectly =
  typeof process !== "undefined" &&
  process.argv[1] &&
  process.argv[1]
    .replace(/\\/g, "/")
    .endsWith("apps/worker/eval/runners/page-first-baseline.ts");

if (invokedDirectly) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
