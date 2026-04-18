/**
 * apps/worker/src/bin/wiki-lint.ts
 *
 * Manual CLI entry point for the wiki-lint orchestrator.
 * Wraps `runWikiLint()` so operators can trigger the same weekly cron on
 * demand (e.g. before/after a bulk ingest). Defaults are safe (dry-run +
 * no LLM); `--persist` and `--with-llm` opt into the expensive paths.
 *
 * Usage:
 *   pnpm --filter @jarvis/worker wiki:lint --workspace=jarvis [--persist] [--with-llm] [--json]
 */

// MUST be first: loads repo-root .env so `@jarvis/db/client`'s module-load
// read of DATABASE_URL sees the right value regardless of cwd.
import "./_load-env.js";

import { db } from "@jarvis/db/client";
import { workspace } from "@jarvis/db/schema/tenant";
import { eq } from "drizzle-orm";

import { runWikiLint, type WikiLintWorkspaceResult } from "../jobs/wiki-lint.js";

interface Cli {
  workspaceCode: string | null;
  all: boolean;
  persist: boolean;
  withLlm: boolean;
  json: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): Cli {
  const cli: Cli = {
    workspaceCode: null,
    all: false,
    persist: false,
    withLlm: false,
    json: false,
    help: false,
  };
  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") cli.help = true;
    else if (arg === "--all") cli.all = true;
    else if (arg === "--persist") cli.persist = true;
    else if (arg === "--with-llm") cli.withLlm = true;
    else if (arg === "--json") cli.json = true;
    else if (arg.startsWith("--workspace=")) {
      cli.workspaceCode = arg.slice("--workspace=".length);
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return cli;
}

function printHelp(): void {
  console.log(`wiki-lint — run all 6 wiki health checks.

Usage:
  pnpm --filter @jarvis/worker wiki:lint --workspace=<code>
  pnpm --filter @jarvis/worker wiki:lint --all

Options:
  --workspace=<code>   Restrict run to a single workspace (by code, e.g. "jarvis").
  --all                Run across every workspace (default when --workspace omitted).
  --persist            Insert review_queue rows + commit lint report + upsert
                       wiki_lint_report. Default: dry-run (counters only).
  --with-llm           Include the LLM-backed contradictions check. Default: skip
                       (keeps the run free).
  --json               Emit machine-readable JSON instead of a text summary.
  -h, --help           Show this help.`);
}

async function resolveWorkspaceIds(cli: Cli): Promise<string[]> {
  if (cli.workspaceCode) {
    const rows = await db
      .select({ id: workspace.id })
      .from(workspace)
      .where(eq(workspace.code, cli.workspaceCode));
    if (rows.length === 0) {
      throw new Error(
        `workspace not found: code="${cli.workspaceCode}"`,
      );
    }
    return [rows[0]!.id];
  }
  // --all or default: return [] so runWikiLint enumerates every workspace.
  return [];
}

function formatTextSummary(results: WikiLintWorkspaceResult[], dryRun: boolean): string {
  if (results.length === 0) {
    return "[wiki-lint] no workspaces processed";
  }
  const lines: string[] = [];
  for (const r of results) {
    const total =
      r.orphanCount +
      r.brokenLinkCount +
      r.contradictionCount +
      r.staleCount +
      r.missingXrefCount +
      r.boundaryViolationCount;
    lines.push(`[wiki-lint] workspace=${r.workspaceId}  report_date=${r.reportDate}`);
    lines.push(`  orphan:             ${r.orphanCount}`);
    lines.push(`  broken-link:        ${r.brokenLinkCount}`);
    lines.push(`  contradiction:      ${r.contradictionCount}`);
    lines.push(`  stale:              ${r.staleCount}`);
    lines.push(`  missing-xref:       ${r.missingXrefCount}`);
    lines.push(`  boundary-violation: ${r.boundaryViolationCount}`);
    lines.push(`  -------------------`);
    lines.push(`  total findings:     ${total}`);
    if (dryRun) {
      lines.push(`  review-queue:       (dry-run — 0 inserts)`);
      lines.push(`  report-commit:      (dry-run — not written)`);
    } else {
      lines.push(`  review-queue:       ${r.reviewQueueInserts} inserts`);
      lines.push(`  report-commit:      ${r.commitSha || "(no repo)"}`);
      if (r.reportPath) lines.push(`  report-path:        ${r.reportPath}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

async function main(): Promise<void> {
  const cli = parseArgs(process.argv.slice(2));
  if (cli.help) {
    printHelp();
    return;
  }

  const workspaceIds = await resolveWorkspaceIds(cli);
  const startMs = Date.now();

  const results = await runWikiLint({
    workspaceIds: workspaceIds.length > 0 ? workspaceIds : undefined,
    dryRun: !cli.persist,
    skipContradictions: !cli.withLlm,
  });

  const durationMs = Date.now() - startMs;

  if (cli.json) {
    console.log(
      JSON.stringify(
        {
          durationMs,
          dryRun: !cli.persist,
          withLlm: cli.withLlm,
          results,
        },
        null,
        2,
      ),
    );
  } else {
    console.log(formatTextSummary(results, !cli.persist));
    console.log(
      `[wiki-lint] done — ${results.length} workspace(s) in ${durationMs}ms  ` +
        `(dry-run=${!cli.persist}, with-llm=${cli.withLlm})`,
    );
  }
}

main().catch((err) => {
  console.error("[wiki-lint] fatal:", err);
  process.exit(1);
});
