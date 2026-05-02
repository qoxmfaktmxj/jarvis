/**
 * scripts/wiki-reproject.ts
 *
 * Task 1 (Karpathy LLM Wiki handoff) — Projection script.
 *
 * Walks `wiki/<workspaceCode>/**\/*.md` on disk, parses frontmatter, and
 * upserts each page into `wiki_page_index` + its wikilinks into
 * `wiki_page_link`. Deterministic (no LLM call). Safe to re-run.
 *
 * Why this exists:
 * The companies-source / case-source / guidebook pipelines wrote Markdown
 * directly into `wiki/jarvis/auto/**` + `wiki/jarvis/manual/**` without going
 * through the worker's two-step ingest pipeline, so those pages are not
 * projected into the DB. That means every read path (search, Ask AI, /infra
 * dashboard) sees zero rows. This one-shot script backfills the projection.
 *
 * Usage:
 *   DATABASE_URL=... node --experimental-strip-types scripts/wiki-reproject.ts \
 *     [--dry-run] [--limit=N] [--domain=infra,syntheses] [--batch-size=200]
 *
 * Tests (mocked DB, no network):
 *   node --test scripts/tests/wiki-reproject.test.ts
 */

import "dotenv/config";

import { promises as fs } from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Pool, type QueryResult, type QueryResultRow } from "pg";

import {
  parseFrontmatter,
  splitFrontmatter,
  parseWikilinks,
  type WikiFrontmatter,
} from "../packages/wiki-fs/src/index.js";
// Direct YAML loader — used for lenient fallback parsing when wiki-fs's
// strict enum validator rejects a manual-authored type (guidebook, policy,
// procedure, reference). DB column is varchar(20), not an enum, so we can
// preserve the original type verbatim.
import YAML from "../packages/wiki-fs/node_modules/yaml/dist/index.js";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface ProjectionRow {
  workspaceId: string;
  path: string;
  title: string;
  slug: string;
  routeKey: string;
  type: string;
  authority: string;
  sensitivity: string;
  requiredPermission: string;
  frontmatter: Record<string, unknown>;
  gitSha: string;
  stale: boolean;
  publishedStatus: string;
}

export interface LinkRequest {
  fromPath: string;
  targetRaw: string;
  alias: string | null;
  anchor: string | null;
}

export interface PrepareArgs {
  wikiPath: string;
  content: string;
  workspaceId: string;
  workspaceCode: string;
  gitSha: string;
}

export interface PrepareResult {
  row: ProjectionRow | null;
  links: LinkRequest[];
  skipped: boolean;
  reason?: string;
}

interface Queryable {
  query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<Row>>;
}

// ─────────────────────────────────────────────────────────────
// Pure: prepareProjection
// ─────────────────────────────────────────────────────────────

const DEFAULT_PERMISSION = "knowledge:read";
const DEFAULT_SENSITIVITY = "INTERNAL";

/**
 * The legacy case-source pipeline emitted frontmatter list items like
 *   - [e-HR] 오스템임플란트
 * without quoting, which YAML 1.2 parses as a broken flow sequence
 * (`[e-HR]` opens a flow, then Korean text appears outside it → "Unexpected
 * scalar at node end"). We lint-fix the offending lines in memory so the
 * projection can succeed. Only touches lines inside the `---`/`---` block
 * that start with `- [` and don't already carry a quote.
 */
export function fixUnquotedFlowListItems(content: string): string {
  const lines = content.split(/\r?\n/);
  if (lines.length < 2) return content;
  if (lines[0] !== "---") return content;
  const endIdx = lines.findIndex((l, i) => i > 0 && l === "---");
  if (endIdx === -1) return content;

  let changed = false;
  for (let i = 1; i < endIdx; i++) {
    const line = lines[i];
    // Leading spaces + `-` + space, then `[`
    const m = /^(\s*-\s+)(\[[^\]]*\].*)$/.exec(line);
    if (!m) continue;
    const [, prefix, body] = m;
    if (body.startsWith('"') || body.startsWith("'")) continue;
    lines[i] = `${prefix}"${body.replace(/"/g, '\\"')}"`;
    changed = true;
  }
  return changed ? lines.join("\n") : content;
}

export function prepareProjection(args: PrepareArgs): PrepareResult {
  const { wikiPath, workspaceId, workspaceCode, gitSha } = args;
  const content = fixUnquotedFlowListItems(args.content);

  // 1) Must have a frontmatter block. splitFrontmatter returns null when the
  //    document does not open with `---`.
  const split = splitFrontmatter(content);
  if (split.frontmatter === null) {
    return {
      row: null,
      links: [],
      skipped: true,
      reason: "no frontmatter block",
    };
  }

  // 2) parseFrontmatter throws for invalid enum values (type/sensitivity/
  //    authority). For manual-authored pages the author may have used
  //    types outside the auto/ enum (`guidebook`, `policy`, `procedure`,
  //    `reference`) — we preserve those verbatim (the DB column is
  //    varchar, not a Postgres enum) so Ask AI / dashboards can still
  //    read them. Fall back to direct YAML parsing on enum violations.
  let parsed: { data: WikiFrontmatter; body: string };
  try {
    parsed = parseFrontmatter(content);
  } catch (err) {
    try {
      const raw = YAML.parse(split.frontmatter) as
        | Record<string, unknown>
        | null;
      if (!raw || typeof raw !== "object") {
        return {
          row: null,
          links: [],
          skipped: true,
          reason: `invalid YAML in frontmatter: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
      parsed = {
        // Cast: we intentionally keep non-enum `type`/`sensitivity`/
        // `authority` values as strings. Downstream only reads them as
        // string, and DB columns are varchar.
        data: raw as WikiFrontmatter,
        body: split.body,
      };
    } catch (yamlErr) {
      return {
        row: null,
        links: [],
        skipped: true,
        reason: `malformed YAML: ${yamlErr instanceof Error ? yamlErr.message : String(yamlErr)}`,
      };
    }
  }

  const fm = parsed.data;

  // 3) Derive slug / routeKey from the on-disk path. `wikiPath` is the
  //    repo-relative POSIX path, e.g. "wiki/jarvis/auto/infra/whe/운영-ip-row1.md".
  const prefix = `wiki/${workspaceCode}/`;
  const relPath = wikiPath.startsWith(prefix)
    ? wikiPath.slice(prefix.length)
    : wikiPath;
  const slug = path.basename(relPath).replace(/\.md$/, "");
  const routeKey = relPath.replace(/\.md$/, "");

  const title =
    typeof fm.title === "string" && fm.title.trim().length > 0
      ? fm.title
      : slug;

  const row: ProjectionRow = {
    workspaceId,
    path: wikiPath,
    title,
    slug,
    routeKey,
    type: fm.type ?? "concept",
    authority: fm.authority ?? "auto",
    sensitivity:
      typeof fm.sensitivity === "string" ? fm.sensitivity : DEFAULT_SENSITIVITY,
    requiredPermission:
      typeof fm.requiredPermission === "string" && fm.requiredPermission.length > 0
        ? fm.requiredPermission
        : DEFAULT_PERMISSION,
    frontmatter: fm as Record<string, unknown>,
    gitSha,
    stale: false,
    publishedStatus: "published",
  };

  // 4) Extract wikilinks from the body. Defensive: on parse failure we
  //    still return the row (skip only the links).
  let links: LinkRequest[] = [];
  try {
    const parsedLinks = parseWikilinks(parsed.body);
    links = parsedLinks.map((link) => ({
      fromPath: wikiPath,
      targetRaw: link.target,
      alias: link.alias ?? null,
      anchor: link.anchor ?? null,
    }));
  } catch {
    links = [];
  }

  return { row, links, skipped: false };
}

// ─────────────────────────────────────────────────────────────
// File walk
// ─────────────────────────────────────────────────────────────

export async function collectWikiFiles(
  rootDir: string,
  filter?: (relPath: string) => boolean,
): Promise<Array<{ wikiPath: string; content: string }>> {
  const cwd = process.cwd();
  const files: Array<{ wikiPath: string; content: string }> = [];

  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
      throw err;
    }
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(abs);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
      const rel = path.relative(cwd, abs).replace(/\\/g, "/");
      if (filter && !filter(rel)) continue;
      const content = await fs.readFile(abs, "utf-8");
      files.push({ wikiPath: rel, content });
    }
  }

  await walk(rootDir);
  return files;
}

// ─────────────────────────────────────────────────────────────
// DB: upsertPagesBatch
// ─────────────────────────────────────────────────────────────

export async function upsertPagesBatch(
  executor: Queryable,
  rows: ProjectionRow[],
): Promise<Map<string, string>> {
  const pathToId = new Map<string, string>();
  if (rows.length === 0) return pathToId;

  const placeholders: string[] = [];
  const values: unknown[] = [];
  let p = 1;
  for (const row of rows) {
    placeholders.push(
      `($${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}::jsonb, $${p++}, $${p++}, $${p++})`,
    );
    values.push(
      row.workspaceId,
      row.path,
      row.title,
      row.slug,
      row.routeKey,
      row.type,
      row.authority,
      row.sensitivity,
      row.requiredPermission,
      JSON.stringify(row.frontmatter),
      row.gitSha,
      row.stale,
      row.publishedStatus,
    );
  }

  const text = `
    INSERT INTO wiki_page_index (
      workspace_id, path, title, slug, route_key, type, authority,
      sensitivity, required_permission, frontmatter, git_sha, stale, published_status
    ) VALUES ${placeholders.join(",")}
    ON CONFLICT (workspace_id, path) DO UPDATE SET
      title = EXCLUDED.title,
      slug = EXCLUDED.slug,
      route_key = EXCLUDED.route_key,
      type = EXCLUDED.type,
      authority = EXCLUDED.authority,
      sensitivity = EXCLUDED.sensitivity,
      required_permission = EXCLUDED.required_permission,
      frontmatter = EXCLUDED.frontmatter,
      git_sha = EXCLUDED.git_sha,
      stale = EXCLUDED.stale,
      published_status = EXCLUDED.published_status,
      updated_at = NOW()
    RETURNING id, path
  `;

  const result = await executor.query<{ id: string; path: string }>(text, values);
  for (const r of result.rows) {
    pathToId.set(r.path, r.id);
  }
  return pathToId;
}

// ─────────────────────────────────────────────────────────────
// DB: upsertLinksBatch
// ─────────────────────────────────────────────────────────────

export async function upsertLinksBatch(
  executor: Queryable,
  workspaceId: string,
  links: LinkRequest[],
  pathToId: Map<string, string>,
  workspaceCode: string,
): Promise<number> {
  if (links.length === 0) return 0;

  const prefix = `wiki/${workspaceCode}/`;

  interface ResolvedLink {
    fromId: string;
    toId: string | null;
    toPath: string;
    alias: string | null;
    anchor: string | null;
  }
  const resolved: ResolvedLink[] = [];

  for (const link of links) {
    const fromId = pathToId.get(link.fromPath);
    if (!fromId) continue; // source page missing from this batch's upsert
    const target = link.targetRaw.trim();
    if (!target) continue;

    const withExt = target.endsWith(".md") ? target : `${target}.md`;
    const candidates = [
      `${prefix}${withExt}`,
      `${prefix}auto/${withExt}`,
      `${prefix}manual/${withExt}`,
      withExt,
    ];
    let toPath: string | null = null;
    for (const c of candidates) {
      if (pathToId.has(c)) {
        toPath = c;
        break;
      }
    }
    // Basename fallback: last resort match on filename only.
    if (!toPath) {
      const basename = path.basename(withExt);
      for (const p of pathToId.keys()) {
        if (p.endsWith(`/${basename}`)) {
          toPath = p;
          break;
        }
      }
    }
    const toId = toPath ? pathToId.get(toPath) ?? null : null;

    resolved.push({
      fromId,
      toId,
      toPath: toPath ?? withExt,
      alias: link.alias,
      anchor: link.anchor,
    });
  }

  if (resolved.length === 0) return 0;

  // 1) DELETE direct links from these source pages (idempotent re-run).
  const fromIds = Array.from(new Set(resolved.map((r) => r.fromId)));
  await executor.query(
    `DELETE FROM wiki_page_link WHERE from_page_id = ANY($1::uuid[]) AND kind = 'direct'`,
    [fromIds],
  );

  // 2) Batch INSERT. Unique index on (from_page_id, to_path, alias, anchor)
  //    — same-page duplicates get swallowed by ON CONFLICT DO NOTHING.
  const placeholders: string[] = [];
  const values: unknown[] = [];
  let p = 1;
  for (const r of resolved) {
    placeholders.push(
      `($${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, 'direct')`,
    );
    values.push(workspaceId, r.fromId, r.toId, r.toPath, r.alias, r.anchor);
  }
  await executor.query(
    `INSERT INTO wiki_page_link (workspace_id, from_page_id, to_page_id, to_path, alias, anchor, kind)
     VALUES ${placeholders.join(",")}
     ON CONFLICT DO NOTHING`,
    values,
  );

  return resolved.length;
}

// ─────────────────────────────────────────────────────────────
// Orchestrator
// ─────────────────────────────────────────────────────────────

function resolveGitSha(): string {
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf-8" }).trim();
  } catch {
    return "0000000000000000000000000000000000000000";
  }
}

async function lookupWorkspaceId(pool: Pool, code: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    "SELECT id FROM workspace WHERE code = $1 LIMIT 1",
    [code],
  );
  if (rows.length === 0) {
    throw new Error(
      `workspace with code="${code}" not found — seed with \`pnpm db:seed\` or create it manually`,
    );
  }
  return rows[0].id;
}

export interface ReprojectOptions {
  workspaceCode?: string;
  rootDir?: string;
  dryRun?: boolean;
  limit?: number;
  domainFilter?: string[];
  batchSize?: number;
}

export interface ReprojectReport {
  collected: number;
  processed: number;
  skipped: number;
  linksInserted: number;
  skipReasons: Record<string, number>;
}

export async function runReproject(
  opts: ReprojectOptions = {},
): Promise<ReprojectReport> {
  const workspaceCode = opts.workspaceCode ?? "jarvis";
  const rootDir =
    opts.rootDir ?? path.join(process.cwd(), "wiki", workspaceCode);
  const batchSize = opts.batchSize ?? 200;

  const skipReasons: Record<string, number> = {};
  const gitSha = resolveGitSha();

  // dry-run skips DB entirely — useful for local verification without PG.
  let pool: Pool | null = null;
  let workspaceId: string;
  if (opts.dryRun) {
    workspaceId = "00000000-0000-0000-0000-000000000000";
    console.log(
      `[reproject] dry-run: using dummy workspaceId (no DB connection)`,
    );
  } else {
    const connectionString = process.env["DATABASE_URL"];
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set; cannot connect to Postgres");
    }
    pool = new Pool({ connectionString });
    workspaceId = await lookupWorkspaceId(pool, workspaceCode);
  }

  try {

    console.log(
      `[reproject] workspace=${workspaceCode} (${workspaceId.slice(0, 8)}) git=${gitSha.slice(0, 8)} root=${rootDir}`,
    );

    const all = await collectWikiFiles(rootDir, (rel) => {
      if (!opts.domainFilter || opts.domainFilter.length === 0) return true;
      return opts.domainFilter.some(
        (d) =>
          rel.startsWith(`wiki/${workspaceCode}/auto/${d}/`) ||
          rel.startsWith(`wiki/${workspaceCode}/manual/${d}/`) ||
          rel.startsWith(`wiki/${workspaceCode}/${d}/`),
      );
    });
    const files = opts.limit ? all.slice(0, opts.limit) : all;
    console.log(
      `[reproject] collected ${all.length} md files, processing ${files.length}`,
    );

    const rows: ProjectionRow[] = [];
    const allLinks: LinkRequest[] = [];
    let skippedCount = 0;
    let sampleLogged = 0;

    for (const f of files) {
      const r = prepareProjection({
        wikiPath: f.wikiPath,
        content: f.content,
        workspaceId,
        workspaceCode,
        gitSha,
      });
      if (r.skipped || !r.row) {
        skippedCount++;
        const reasonKey = (r.reason ?? "unknown").split(":")[0];
        skipReasons[reasonKey] = (skipReasons[reasonKey] ?? 0) + 1;
        if (sampleLogged < 5) {
          console.warn(`[reproject] skip ${f.wikiPath}: ${r.reason}`);
          sampleLogged++;
        }
        continue;
      }
      rows.push(r.row);
      allLinks.push(...r.links);
    }

    console.log(
      `[reproject] prepared ${rows.length} rows (${skippedCount} skipped), ${allLinks.length} wikilinks`,
    );

    if (opts.dryRun || !pool) {
      console.log("[reproject] --dry-run set → no DB writes");
      return {
        collected: all.length,
        processed: rows.length,
        skipped: skippedCount,
        linksInserted: 0,
        skipReasons,
      };
    }

    // 1) Upsert pages in batches to build path→id map
    const pathToId = new Map<string, string>();
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const batchMap = await upsertPagesBatch(pool, batch);
      for (const [p, id] of batchMap) pathToId.set(p, id);
      console.log(
        `[reproject] pages ${Math.min(i + batchSize, rows.length)}/${rows.length}`,
      );
    }

    // 2) Upsert links (grouped by source page to keep DELETE semantics sound)
    //    Group all links for the same fromPath so the DELETE-then-INSERT
    //    doesn't wipe an earlier batch's rows.
    const linksByFrom = new Map<string, LinkRequest[]>();
    for (const link of allLinks) {
      const bucket = linksByFrom.get(link.fromPath);
      if (bucket) bucket.push(link);
      else linksByFrom.set(link.fromPath, [link]);
    }
    let linksInserted = 0;
    // Flush group-by-group in reasonable chunks
    const fromPaths = Array.from(linksByFrom.keys());
    for (let i = 0; i < fromPaths.length; i += batchSize) {
      const slice = fromPaths.slice(i, i + batchSize);
      const linkBatch: LinkRequest[] = [];
      for (const fp of slice) {
        const ls = linksByFrom.get(fp);
        if (ls) linkBatch.push(...ls);
      }
      const n = await upsertLinksBatch(
        pool,
        workspaceId,
        linkBatch,
        pathToId,
        workspaceCode,
      );
      linksInserted += n;
    }
    console.log(`[reproject] inserted ${linksInserted} wikilinks`);

    return {
      collected: all.length,
      processed: rows.length,
      skipped: skippedCount,
      linksInserted,
      skipReasons,
    };
  } finally {
    if (pool) await pool.end();
  }
}

// ─────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────

function parseCliArgs(argv: string[]): ReprojectOptions {
  const opts: ReprojectOptions = {};
  for (const arg of argv) {
    if (arg === "--dry-run") opts.dryRun = true;
    else if (arg.startsWith("--limit=")) opts.limit = Number(arg.split("=")[1]);
    else if (arg.startsWith("--domain=")) {
      opts.domainFilter = arg.split("=")[1].split(",").filter(Boolean);
    } else if (arg.startsWith("--batch-size=")) {
      opts.batchSize = Number(arg.split("=")[1]);
    } else if (arg.startsWith("--workspace=")) {
      opts.workspaceCode = arg.split("=")[1];
    }
  }
  return opts;
}

const executedAsMain = (() => {
  try {
    const argv1 = process.argv[1];
    if (!argv1) return false;
    const mainPath = fileURLToPath(import.meta.url);
    return path.resolve(mainPath) === path.resolve(argv1);
  } catch {
    return false;
  }
})();

if (executedAsMain) {
  const opts = parseCliArgs(process.argv.slice(2));
  runReproject(opts)
    .then((r) => {
      console.log(
        `[reproject] done: collected=${r.collected} processed=${r.processed} skipped=${r.skipped} links=${r.linksInserted}`,
      );
      if (Object.keys(r.skipReasons).length > 0) {
        console.log(`[reproject] skip reasons:`, r.skipReasons);
      }
      process.exit(0);
    })
    .catch((err) => {
      console.error("[reproject] FAILED:", err);
      process.exit(1);
    });
}
