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
 * NOTE:
 *   Wiring this up to the live page-first pipeline requires a real DB
 *   connection + a workspace with ingested pages + a user-permissions vector.
 *   To keep the runner importable (and CI-safe) without those prerequisites,
 *   the shortlist call is left as a `// TODO` placeholder. When running
 *   against a live environment, uncomment the `lexicalShortlist` call and
 *   supply workspaceId / userPermissions via env.
 *
 *   Real import path (per `packages/ai/page-first/shortlist.ts`):
 *     import { lexicalShortlist } from "@jarvis/ai/page-first/shortlist";
 *   That export is NOT yet declared in `packages/ai/package.json` → a follow-up
 *   task can add `"./page-first/shortlist": "./page-first/shortlist.ts"` to
 *   the exports map when we enable live runs.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// import { lexicalShortlist } from "@jarvis/ai/page-first/shortlist"; // enable for live runs

interface Fixture {
  query: string;
  expectedPages: string[];
  answerPatterns: string[];
  curatorUserId: string;
  reviewedByUserId: string;
}

interface EvalResult {
  query: string;
  retrievedPages: string[];
  hit: boolean;
  recall: number; // 0..1
}

const TOP_K = 5;

export async function runEval(fixturePath: string): Promise<EvalResult[]> {
  const lines = readFileSync(fixturePath, "utf-8")
    .split("\n")
    .filter((l) => l.trim().length > 0);

  const fixtures: Fixture[] = lines.map((l, idx) => {
    try {
      return JSON.parse(l) as Fixture;
    } catch (err) {
      throw new Error(
        `page-qa.jsonl line ${idx + 1}: invalid JSON — ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  });

  const results: EvalResult[] = [];

  for (const fixture of fixtures) {
    // TODO(v4-W3-T4-live): 실제 page-first shortlist 호출 연결.
    //
    //   const hits = await lexicalShortlist({
    //     workspaceId: process.env.EVAL_WORKSPACE_ID!,
    //     userPermissions: (process.env.EVAL_USER_PERMS ?? "").split(","),
    //     question: fixture.query,
    //     topK: TOP_K,
    //   });
    //   const retrievedPages = hits.map((h) => h.path);
    //
    // 라이브 실행에는 DB 연결 + 인덱싱된 워크스페이스가 필요하므로 지금은
    // placeholder. 현재 구조만 검증한다.
    const retrievedPages: string[] = [];

    const hit =
      fixture.expectedPages.length === 0 ||
      fixture.expectedPages.some((ep) => retrievedPages.includes(ep));

    const recall =
      fixture.expectedPages.length === 0
        ? 1
        : fixture.expectedPages.filter((ep) => retrievedPages.includes(ep))
            .length / fixture.expectedPages.length;

    results.push({
      query: fixture.query,
      retrievedPages,
      hit,
      recall,
    });
  }

  return results;
}

function formatReport(results: EvalResult[]): string {
  const total = results.length;
  const hits = results.filter((r) => r.hit).length;
  const recall5 = total === 0 ? 0 : hits / total;

  return `# Page-First Eval Baseline (${new Date().toISOString().slice(0, 10)})

## 결과

| 지표 | 값 |
|------|-----|
| 총 쿼리 수 | ${total} |
| Hit 수 | ${hits} |
| Recall@${TOP_K} | ${(recall5 * 100).toFixed(1)}% |
| 목표 | ≥ 70% (W3 게이트) |

## 상세

${results
  .map(
    (r) =>
      `- **${r.query}** → hit=${r.hit}, recall=${r.recall.toFixed(2)}` +
      (r.retrievedPages.length
        ? `, retrieved=[${r.retrievedPages.join(", ")}]`
        : ""),
  )
  .join("\n")}
`;
}

async function main(): Promise<void> {
  const fixturePath = join(
    process.cwd(),
    "apps/worker/eval/fixtures/2026-04/page-qa.jsonl",
  );

  const results = await runEval(fixturePath);
  const report = formatReport(results);

  const outputIdx = process.argv.indexOf("--output");
  const outputPath =
    outputIdx !== -1 && process.argv[outputIdx + 1]
      ? process.argv[outputIdx + 1]!
      : "eval-baseline.md";

  writeFileSync(outputPath, report, "utf-8");

  const hits = results.filter((r) => r.hit).length;
  const recall5 = results.length === 0 ? 0 : hits / results.length;
  console.log(`Report written to ${outputPath}`);
  console.log(`Recall@${TOP_K}: ${(recall5 * 100).toFixed(1)}%`);
}

// Only auto-run when invoked as a script (not when imported by tests).
const invokedDirectly =
  typeof process !== "undefined" &&
  process.argv[1] &&
  process.argv[1].replace(/\\/g, "/").endsWith(
    "apps/worker/eval/runners/page-first-baseline.ts",
  );

if (invokedDirectly) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
