// apps/worker/src/jobs/graphify-build.ts

import type PgBoss from 'pg-boss';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { db } from '@jarvis/db/client';
import { rawSource } from '@jarvis/db/schema/file';
import { graphSnapshot } from '@jarvis/db/schema/graph';
import { eq } from 'drizzle-orm';
import { minioClient, BUCKET } from '../lib/minio-client.js';
import { unarchive, countFiles } from '../helpers/unarchive.js';
import { importAsKnowledgePage, slugify } from '../helpers/import-knowledge.js';
import { resolveLineageFromRawSource } from '../helpers/resolve-lineage.js';
import { materializeGraph, type GraphJson } from '../helpers/materialize-graph.js';

const execFileAsync = promisify(execFile);

const GRAPHIFY_BIN = process.env['GRAPHIFY_BIN'] || 'graphify';
const GRAPHIFY_TIMEOUT_MS = parseInt(
  process.env['GRAPHIFY_TIMEOUT_MS'] || '600000',
  10,
);
// NOTE: graphify binary (reference_only/graphify) is 100% deterministic
// (tree-sitter AST + NetworkX + Leiden/Louvain). It makes no LLM calls
// internally — no API key needed. Semantic enrichment, if ever required,
// must happen in a separate step via @jarvis/ai (OpenAI gpt-5.4-mini).
const MAX_FILE_COUNT = parseInt(
  process.env['GRAPHIFY_MAX_FILE_COUNT'] || '5000',
  10,
);
const MAX_ARCHIVE_MB = parseInt(
  process.env['GRAPHIFY_MAX_ARCHIVE_MB'] || '200',
  10,
);

// -----------------------------------------------------------------------------
// Phase-W3 v4-W3-T2 — Graphify output isolation.
//
// Graphify's deterministic AST output must be quarantined from the LLM-owned
// entity/concept tree. All derived code pages live under this single path
// prefix; LLM ingest reads from here but never writes back into it.
//
// File-system mirror (when FEATURE_GRAPHIFY_DERIVED_PAGES is enabled later):
//   wiki/{workspaceId}/auto/derived/code/{path}.md
//
// DB-side marker (now): sourceKey always begins with `graphify:derived/code/`
// and frontmatter body is prefixed with `type: derived` so downstream query /
// ingest pipelines can tell machine-generated pages apart from LLM synthesis.
// -----------------------------------------------------------------------------
const GRAPHIFY_OUTPUT_PATH = 'wiki/auto/derived/code' as const;
const GRAPHIFY_SOURCE_KEY_PREFIX = 'graphify:derived/code' as const;

/**
 * Ensure a Graphify-produced markdown body carries `type: derived` frontmatter.
 * - If frontmatter already exists, patch `type:` to `derived` (preserve other fields).
 * - Otherwise prepend a minimal frontmatter block.
 *
 * Graphify's native output has no frontmatter, so the common path is the
 * prepend branch. The patch branch is defensive in case a future Graphify
 * version starts emitting frontmatter.
 */
function ensureDerivedFrontmatter(
  mdxContent: string,
  params: {
    title: string;
    workspaceId: string;
    sensitivity: string;
    sourcePath: string;
  },
): string {
  const hasFrontmatter = mdxContent.startsWith('---\n') || mdxContent.startsWith('---\r\n');
  if (hasFrontmatter) {
    // Defensive: patch existing type field or inject one.
    const match = mdxContent.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
    if (match) {
      const fmBody = match[1] ?? '';
      const rest = mdxContent.slice(match[0].length);
      const typeRegex = /^type:\s*.*$/m;
      const patchedFm = typeRegex.test(fmBody)
        ? fmBody.replace(typeRegex, 'type: derived')
        : `type: derived\n${fmBody}`;
      return `---\n${patchedFm}\n---\n${rest}`;
    }
  }
  const now = new Date().toISOString();
  const fm = [
    '---',
    `title: ${JSON.stringify(params.title)}`,
    'type: derived',
    `workspaceId: ${params.workspaceId}`,
    `sensitivity: ${params.sensitivity}`,
    'authority: auto',
    `sources:`,
    `  - ${params.sourcePath}`,
    'tags:',
    '  - derived/code',
    `created: ${now}`,
    `updated: ${now}`,
    '---',
    '',
  ].join('\n');
  return fm + mdxContent;
}

export interface GraphifyBuildPayload {
  rawSourceId: string;
  workspaceId: string;
  requestedBy: string;
  mode?: 'standard' | 'deep';
}

export async function graphifyBuildHandler(
  jobs: PgBoss.Job<GraphifyBuildPayload>[],
): Promise<void> {
  // batchSize: 1 — CPU/memory intensive, run one at a time
  for (const job of jobs) {
    await processGraphifyBuild(job);
  }
}

async function processGraphifyBuild(
  job: PgBoss.Job<GraphifyBuildPayload>,
): Promise<void> {
  const { rawSourceId, workspaceId, requestedBy, mode } = job.data;
  const snapshotId = randomUUID();
  const startTime = Date.now();

  console.log(
    `[graphify-build] Starting snapshotId=${snapshotId} rawSourceId=${rawSourceId}`,
  );

  const lineage = await resolveLineageFromRawSource(rawSourceId);
  console.log(
    `[graphify-build] Resolved lineage scopeType=${lineage.scopeType} scopeId=${lineage.scopeId} sensitivity=${lineage.sensitivity}`,
  );

  // Create snapshot record with 'running' status
  await db.insert(graphSnapshot).values({
    id: snapshotId,
    workspaceId,
    rawSourceId,
    scopeType: lineage.scopeType,
    scopeId: lineage.scopeId,
    sensitivity: lineage.sensitivity,
    title: 'Building...',
    buildMode: mode ?? 'standard',
    buildStatus: 'running',
    createdBy: requestedBy,
    updatedAt: new Date(),
  });

  let tempDir: string | undefined;

  try {
    // 1. Fetch raw_source record
    const [source] = await db
      .select()
      .from(rawSource)
      .where(eq(rawSource.id, rawSourceId))
      .limit(1);

    if (!source?.storagePath) {
      throw new Error(
        `raw_source ${rawSourceId} not found or missing storagePath`,
      );
    }

    // 2. Size guard
    const sizeMB = (source.sizeBytes ?? 0) / (1024 * 1024);
    if (sizeMB > MAX_ARCHIVE_MB) {
      throw new Error(
        `Archive too large: ${sizeMB.toFixed(1)}MB exceeds ${MAX_ARCHIVE_MB}MB limit`,
      );
    }

    // 3. Create temp dir, download archive, extract
    tempDir = await mkdtemp(join(tmpdir(), 'graphify-'));
    const archivePath = join(
      tempDir,
      source.originalFilename ?? 'archive.zip',
    );

    await minioClient.fGetObject(BUCKET, source.storagePath, archivePath);
    await unarchive(archivePath, tempDir);

    // 4. File count guard
    const fileCount = await countFiles(tempDir);
    if (fileCount > MAX_FILE_COUNT) {
      throw new Error(
        `Too many files: ${fileCount} exceeds ${MAX_FILE_COUNT} limit`,
      );
    }

    // 5. Write .graphifyignore to skip build artifacts
    const ignoreContent = [
      'node_modules/',
      '.git/',
      'dist/',
      'build/',
      'vendor/',
      '__pycache__/',
      '.venv/',
      '.tox/',
      '.mypy_cache/',
      '*.min.js',
      '*.min.css',
      '*.map',
      '*.pyc',
      '*.pyo',
      '*.so',
      '*.dylib',
    ].join('\n');
    await writeFile(join(tempDir, '.graphifyignore'), ignoreContent);

    // 6. Run Graphify subprocess
    const args = [tempDir, '--wiki'];
    if (mode === 'deep') args.push('--mode', 'deep');

    const { stderr } = await execFileAsync(GRAPHIFY_BIN, args, {
      timeout: GRAPHIFY_TIMEOUT_MS,
      maxBuffer: 50 * 1024 * 1024,
      env: {
        // Explicit allowlist — do not pass DB/MinIO credentials to subprocess
        PATH: process.env['PATH'] ?? '/usr/local/bin:/usr/bin:/bin',
        HOME: process.env['HOME'] ?? '/root',
        TMPDIR: process.env['TMPDIR'] ?? '/tmp',
        LANG: process.env['LANG'] ?? 'en_US.UTF-8',
      },
    });

    if (stderr) {
      console.warn(`[graphify-build] stderr: ${stderr.slice(0, 500)}`);
    }

    // 7. Collect outputs — Graphify writes to <targetDir>/graphify-out/
    const outDir = join(tempDir, 'graphify-out');

    // 7a. graph.json → MinIO
    const graphJsonKey = `graphify/${workspaceId}/${snapshotId}/graph.json`;
    try {
      await minioClient.fPutObject(BUCKET, graphJsonKey, join(outDir, 'graph.json'));
    } catch {
      console.warn('[graphify-build] graph.json not found — skipping MinIO upload');
    }

    // 7b. graph.html → MinIO (present when --no-viz is NOT passed)
    let graphHtmlKey: string | undefined;
    try {
      graphHtmlKey = `graphify/${workspaceId}/${snapshotId}/graph.html`;
      await minioClient.fPutObject(BUCKET, graphHtmlKey, join(outDir, 'graph.html'));
    } catch {
      graphHtmlKey = undefined;
      console.log('[graphify-build] graph.html not found — skipping');
    }

    // 8. Import GRAPH_REPORT.md as a knowledge_page
    let reportTitle = `[Graph] Architecture Report`;
    try {
      const reportRaw = await readFile(
        join(outDir, 'GRAPH_REPORT.md'),
        'utf-8',
      );
      reportTitle = `[Graph] Architecture Report — ${source.originalFilename ?? 'archive'}`;
      const reportDerivedPath = `${GRAPHIFY_OUTPUT_PATH}/GRAPH_REPORT.md`;
      const reportContent = ensureDerivedFrontmatter(reportRaw, {
        title: reportTitle,
        workspaceId,
        sensitivity: lineage.sensitivity,
        sourcePath: `attachment:${rawSourceId}`,
      });
      await importAsKnowledgePage({
        workspaceId,
        title: reportTitle,
        slug: slugify(`graph-report-${snapshotId.slice(0, 8)}`),
        mdxContent: reportContent,
        pageType: 'analysis',
        sensitivity: lineage.sensitivity,
        createdBy: requestedBy,
        sourceType: 'graphify',
        sourceKey: `${GRAPHIFY_SOURCE_KEY_PREFIX}:${rawSourceId}:${reportDerivedPath}`,
      });
    } catch {
      console.warn(
        '[graphify-build] GRAPH_REPORT.md not found — skipping knowledge import',
      );
    }

    // 8b. wiki/*.md → individual knowledge pages
    try {
      const wikiDir = join(outDir, 'wiki');
      const wikiFiles = await readdir(wikiDir).catch(() => [] as string[]);
      const mdFiles = wikiFiles.filter((f) => f.endsWith('.md'));

      console.log(`[graphify-build] Found ${mdFiles.length} wiki files`);

      for (const wikiFile of mdFiles) {
        const rawContent = await readFile(join(wikiDir, wikiFile), 'utf-8');
        const title = wikiFile.replace(/\.md$/, '').replace(/_/g, ' ');
        // Isolation marker: every Graphify wiki page carries `type: derived`
        // frontmatter + a `graphify:derived/code/` sourceKey. Downstream
        // pipelines filter on these to keep the entity/concept tree clean.
        const derivedPath = `${GRAPHIFY_OUTPUT_PATH}/${wikiFile}`;
        const content = ensureDerivedFrontmatter(rawContent, {
          title: `[Graph] ${title}`,
          workspaceId,
          sensitivity: lineage.sensitivity,
          sourcePath: `attachment:${rawSourceId}`,
        });

        await importAsKnowledgePage({
          workspaceId,
          title: `[Graph] ${title}`,
          slug: slugify(`graph-wiki-${snapshotId.slice(0, 8)}-${title}`),
          mdxContent: content,
          pageType: 'analysis',
          sensitivity: lineage.sensitivity,
          createdBy: requestedBy,
          sourceType: 'graphify',
          sourceKey: `${GRAPHIFY_SOURCE_KEY_PREFIX}:${rawSourceId}:${derivedPath}`,
        });
      }
    } catch (err) {
      // Wiki import failure should not fail the entire build
      console.warn(
        `[graphify-build] Wiki import error: ${err instanceof Error ? err.message : err}`,
      );
    }

    // 9. Parse graph.json for stats
    let nodeCount = 0;
    let edgeCount = 0;
    let communityCount = 0;
    let analysisMetadata: {
      godNodes?: string[];
      communityLabels?: string[];
      suggestedQuestions?: string[];
      tokenReduction?: number;
    } = {};

    try {
      const graphJsonRaw = await readFile(join(outDir, 'graph.json'), 'utf-8');
      const graphJson = JSON.parse(graphJsonRaw) as GraphJson & {
        graph?: { suggested_questions?: string[] };
      };

      // Materialize to DB for graph-aware Ask AI
      const stats = await materializeGraph(snapshotId, {
        nodes: graphJson.nodes ?? [],
        links: graphJson.links ?? [],
      });
      nodeCount = stats.nodeCount;
      edgeCount = stats.edgeCount;
      communityCount = stats.communityCount;

      // Top 5 nodes by edge degree (god nodes)
      const edgeCounts = new Map<string, number>();
      for (const link of graphJson.links ?? []) {
        const src = link._src ?? link.source;
        const tgt = link._tgt ?? link.target;
        edgeCounts.set(src, (edgeCounts.get(src) ?? 0) + 1);
        edgeCounts.set(tgt, (edgeCounts.get(tgt) ?? 0) + 1);
      }
      const godNodes = [...edgeCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([id]) => {
          const node = graphJson.nodes?.find((n) => n.id === id);
          return node?.label ?? id;
        });

      analysisMetadata = {
        godNodes,
        communityLabels: [...Array.from(new Set((graphJson.nodes ?? []).map((n) => n.community).filter((c): c is number => c != null)))].map(String),
        suggestedQuestions: graphJson.graph?.suggested_questions ?? [],
      };
    } catch {
      console.warn(
        '[graphify-build] graph.json parsing failed — continuing with empty stats',
      );
    }

    // 10. Update snapshot to 'done'
    const durationMs = Date.now() - startTime;
    await db
      .update(graphSnapshot)
      .set({
        title: reportTitle,
        graphJsonPath: graphJsonKey,
        graphHtmlPath: graphHtmlKey,
        nodeCount,
        edgeCount,
        communityCount,
        fileCount,
        buildStatus: 'done',
        buildDurationMs: durationMs,
        analysisMetadata,
        updatedAt: new Date(),
      })
      .where(eq(graphSnapshot.id, snapshotId));

    console.log(
      `[graphify-build] Completed snapshotId=${snapshotId} nodes=${nodeCount} edges=${edgeCount} duration=${durationMs}ms`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[graphify-build] Failed snapshotId=${snapshotId}: ${message}`,
    );

    await db
      .update(graphSnapshot)
      .set({
        buildStatus: 'error',
        buildError: message.slice(0, 2000),
        buildDurationMs: Date.now() - startTime,
        updatedAt: new Date(),
      })
      .where(eq(graphSnapshot.id, snapshotId));

    throw err; // re-throw so pg-boss retries
  } finally {
    // 11. Always clean up temp dir
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
