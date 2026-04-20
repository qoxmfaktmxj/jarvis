// apps/worker/eval/run.ts
// Usage: pnpm eval:run
//
// Loads 30 fixtures under apps/worker/eval/fixtures/2026-04/, calls packages/ai askAI,
// records per-item latency/cost/cache_hit/error, prints summary.
import { performance } from "node:perf_hooks";
import { loadFixtures, type EvalFixture } from "./loader.js";

const FIXTURE_DIR = "apps/worker/eval/fixtures/2026-04";
const WORKSPACE_ID =
  process.env["EVAL_WORKSPACE_ID"] ?? "00000000-0000-0000-0000-000000000001";

export interface EvalSummary {
  total: number;
  errors: number;
  /** ratio 0–1 */
  cache_hit_rate: number;
  avg_latency_ms: number;
  avg_cost_usd: number;
}

interface Row {
  id: string;
  error: string | null;
  latency_ms: number;
  cost_usd: number;
  cache_hit: boolean;
  keyword_hits: number;
}

async function runOneDryRun(fx: EvalFixture, seen: Set<string>): Promise<Row> {
  const cache_hit = seen.has(fx.query);
  seen.add(fx.query);
  return {
    id: fx.id,
    error: null,
    latency_ms: 0,
    cost_usd: 0,
    cache_hit,
    keyword_hits: fx.expected_keywords.length, // pretend perfect in dry run
  };
}

async function runOne(fx: EvalFixture, seen: Set<string>): Promise<Row> {
  const start = performance.now();
  let error: string | null = null;
  let resultText = "";

  try {
    const { pageFirstAsk } = await import("@jarvis/ai/page-first");
    for await (const ev of pageFirstAsk({
      question: fx.query,
      workspaceId: WORKSPACE_ID,
      userPermissions: ["graph:read"],
      snapshotId: undefined,
      userCompany: undefined,
    })) {
      const event = ev as { type: string; delta?: string };
      if (event.type === "token" && event.delta) {
        resultText += event.delta;
      }
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const latency_ms = performance.now() - start;

  // cost_usd from most recent llm_call_log for this workspace (Lane A dependency)
  let cost_usd = 0;
  try {
    const mod = await import("@jarvis/db/schema/llm-call-log");
    const { db } = await import("@jarvis/db/client");
    const { desc, eq } = await import("drizzle-orm");
    const llmCallLog = mod.llmCallLog;
    const [last] = await db
      .select()
      .from(llmCallLog)
      .where(eq(llmCallLog.workspaceId, WORKSPACE_ID))
      .orderBy(desc(llmCallLog.createdAt))
      .limit(1);
    if (last && typeof (last as { costUsd?: number }).costUsd === "number") {
      cost_usd = (last as { costUsd: number }).costUsd;
    }
  } catch {
    // llm_call_log may not exist yet (Lane A not merged); cost_usd stays 0
    // TODO: re-enable after Lane A merge
  }

  // cache_hit: same query appeared before in this run
  const cache_hit = seen.has(fx.query);
  seen.add(fx.query);

  const lower = resultText.toLowerCase();
  const keyword_hits = fx.expected_keywords.filter((k) =>
    lower.includes(k.toLowerCase()),
  ).length;

  return { id: fx.id, error, latency_ms, cost_usd, cache_hit, keyword_hits };
}

export async function runEval(opts: {
  fixturesDir?: string;
  dryRun?: boolean;
}): Promise<EvalSummary> {
  const dir = opts.fixturesDir ?? FIXTURE_DIR;
  const dryRun = opts.dryRun ?? false;

  const fixtures = loadFixtures(dir).sort((a, b) =>
    a.id.localeCompare(b.id),
  );

  const rows: Row[] = [];
  const seen = new Set<string>();
  for (const fx of fixtures) {
    const r = dryRun
      ? await runOneDryRun(fx, seen)
      : await runOne(fx, seen);
    rows.push(r);
    if (!dryRun) {
      const status = r.error ? "ERR " : "OK  ";
      console.log(
        `${status}${r.id}  ${r.latency_ms.toFixed(0).padStart(5)}ms  $${r.cost_usd.toFixed(5)}  kw=${r.keyword_hits}/${fixtures.find((f) => f.id === r.id)!.expected_keywords.length}${r.cache_hit ? "  [cache]" : ""}${r.error ? "  err=" + r.error : ""}`,
      );
    }
  }

  const errors = rows.filter((r) => r.error).length;
  const hits = rows.filter((r) => r.cache_hit).length;
  const avgLat =
    rows.length > 0 ? rows.reduce((s, r) => s + r.latency_ms, 0) / rows.length : 0;
  const avgCost =
    rows.length > 0 ? rows.reduce((s, r) => s + r.cost_usd, 0) / rows.length : 0;

  return {
    total: rows.length,
    errors,
    cache_hit_rate: rows.length > 0 ? hits / rows.length : 0,
    avg_latency_ms: avgLat,
    avg_cost_usd: avgCost,
  };
}

// CLI entry point
async function main(): Promise<void> {
  const fixtures = loadFixtures(FIXTURE_DIR).sort((a, b) =>
    a.id.localeCompare(b.id),
  );
  if (fixtures.length !== 50) {
    console.warn(`[eval] expected 50 fixtures, found ${fixtures.length}`);
  }

  const summary = await runEval({ fixturesDir: FIXTURE_DIR, dryRun: false });
  console.log("---");
  console.log(
    `total=${summary.total} errors=${summary.errors} cache_hit_rate=${(summary.cache_hit_rate * 100).toFixed(1)}% avg_latency_ms=${summary.avg_latency_ms.toFixed(0)} avg_cost_usd=${summary.avg_cost_usd.toFixed(5)}`,
  );
  process.exit(summary.errors > 0 ? 1 : 0);
}

// Run CLI when executed directly (not when imported as module in tests)
if (process.argv[1] && process.argv[1].endsWith("run.ts")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
