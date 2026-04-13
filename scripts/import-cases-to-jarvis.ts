import "dotenv/config";

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool, type QueryResult, type QueryResultRow } from "pg";

type Json = Record<string, unknown>;
interface Queryable {
  query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<Row>>;
}

export interface RawCaseRecord extends Json {
  source_key?: unknown;
  original_seq?: unknown;
  higher_category?: unknown;
  lower_category?: unknown;
  app_menu?: unknown;
  process_type?: unknown;
  title?: unknown;
  symptom?: unknown;
  cause?: unknown;
  action?: unknown;
  result?: unknown;
  request_company?: unknown;
  manager_team?: unknown;
  cluster_id?: unknown;
  cluster_label?: unknown;
  is_digest?: unknown;
  severity?: unknown;
  resolved?: unknown;
  urgency?: unknown;
  work_hours?: unknown;
  requested_at?: unknown;
  resolved_at?: unknown;
  sensitivity?: unknown;
  embedding?: unknown;
  tags?: unknown;
}

export interface NormalizedCaseRow {
  sourceKey: string;
  originalSeq: number | null;
  higherCategory: string | null;
  lowerCategory: string | null;
  appMenu: string | null;
  processType: string | null;
  title: string;
  symptom: string | null;
  cause: string | null;
  action: string | null;
  result: string | null;
  requestCompany: string | null;
  managerTeam: string | null;
  clusterId: number | null;
  clusterLabel: string | null;
  isDigest: boolean;
  severity: string | null;
  resolved: boolean;
  urgency: boolean;
  workHours: string | null;
  requestedAt: Date | null;
  resolvedAt: Date | null;
  sensitivity: string;
  embedding: number[] | null;
  tags: string[];
}

export interface ClusterRecord {
  cluster_id: number;
  label: string;
  description?: string | null;
  case_count?: number;
  digest_source_key?: string | null;
  digest_original_seq?: number | null;
  top_symptoms?: string[];
  top_actions?: string[];
}

interface ImportOptions {
  workspaceId: string;
  casesPath: string;
  clustersPath: string;
  batchSize: number;
  dryRun: boolean;
  createDigests: boolean;
  refreshExisting: boolean;
  replaceImportedTsvd: boolean;
}

const DEFAULT_CASES_PATH = "data/cases/normalized_cases.clustered.jsonl";
const DEFAULT_CLUSTERS_PATH = "data/cases/clusters.json";
const CASE_INSERT_COLUMN_COUNT = 26;
const MAX_BATCH_SIZE = Math.floor(65535 / CASE_INSERT_COLUMN_COUNT);

export function chunk<T>(items: T[], size: number): T[][] {
  if (!Number.isInteger(size) || size < 1 || size > MAX_BATCH_SIZE) {
    throw new Error(`Invalid batch size: ${size}. Use an integer between 1 and ${MAX_BATCH_SIZE}.`);
  }
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function stringOrNull(value: unknown, maxLength?: number): string | null {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  if (!str) return null;
  return maxLength ? str.slice(0, maxLength) : str;
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function booleanValue(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return ["Y", "TRUE", "1"].includes(value.toUpperCase());
  return Boolean(value);
}

function dateOrNull(value: unknown): Date | null {
  const str = stringOrNull(value);
  if (!str) return null;
  const date = new Date(str);
  return Number.isNaN(date.getTime()) ? null : date;
}

function embeddingOrNull(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const embedding = value.map(Number);
  return embedding.every(Number.isFinite) ? embedding : null;
}

export function normalizeCaseRow(record: RawCaseRecord): NormalizedCaseRow {
  const workHours = numberOrNull(record.work_hours);
  const tags = Array.isArray(record.tags)
    ? record.tags.map((tag) => String(tag)).filter(Boolean).slice(0, 5)
    : [];
  const sourceKey = stringOrNull(record.source_key, 300);
  if (!sourceKey) {
    throw new Error("Missing required case source_key");
  }
  return {
    sourceKey,
    originalSeq: numberOrNull(record.original_seq),
    higherCategory: stringOrNull(record.higher_category, 100),
    lowerCategory: stringOrNull(record.lower_category, 100),
    appMenu: stringOrNull(record.app_menu, 500),
    processType: stringOrNull(record.process_type, 100),
    title: stringOrNull(record.title, 500) ?? "(제목 없음)",
    symptom: stringOrNull(record.symptom),
    cause: stringOrNull(record.cause),
    action: stringOrNull(record.action),
    result: stringOrNull(record.result),
    requestCompany: stringOrNull(record.request_company, 100),
    managerTeam: stringOrNull(record.manager_team, 100),
    clusterId: numberOrNull(record.cluster_id),
    clusterLabel: stringOrNull(record.cluster_label, 200),
    isDigest: booleanValue(record.is_digest),
    severity: stringOrNull(record.severity, 20),
    resolved: booleanValue(record.resolved),
    urgency: booleanValue(record.urgency),
    workHours: workHours === null ? null : workHours.toFixed(1),
    requestedAt: dateOrNull(record.requested_at),
    resolvedAt: dateOrNull(record.resolved_at),
    sensitivity: stringOrNull(record.sensitivity, 30) ?? "INTERNAL",
    embedding: embeddingOrNull(record.embedding),
    tags,
  };
}

async function readJsonl(path: string): Promise<RawCaseRecord[]> {
  const text = await readFile(path, "utf8");
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line, index) => {
      try {
        return JSON.parse(line) as RawCaseRecord;
      } catch (err) {
        throw new Error(`Invalid JSONL at ${path}:${index + 1}: ${(err as Error).message}`);
      }
    });
}

async function readClusters(path: string): Promise<ClusterRecord[]> {
  const text = await readFile(path, "utf8");
  const parsed = JSON.parse(text) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(`Expected cluster JSON array at ${path}`);
  }
  return parsed.map((item) => item as ClusterRecord);
}

export function validateImportContract(cases: NormalizedCaseRow[], clusters: ClusterRecord[]): void {
  const casesBySourceKey = new Map<string, NormalizedCaseRow>();
  const membershipCounts = new Map<number, number>();
  for (const record of cases) {
    if (casesBySourceKey.has(record.sourceKey)) {
      throw new Error(`Import contract failed: duplicate case source_key ${record.sourceKey}.`);
    }
    casesBySourceKey.set(record.sourceKey, record);
    if (record.clusterId === null || record.clusterId === undefined) {
      throw new Error(`Import contract failed: case ${record.sourceKey} has no cluster_id.`);
    }
    membershipCounts.set(record.clusterId, (membershipCounts.get(record.clusterId) ?? 0) + 1);
  }

  const clusterIds = new Set<number>();
  let clusterCaseCountSum = 0;
  for (const cluster of clusters) {
    if (clusterIds.has(cluster.cluster_id)) {
      throw new Error(`Import contract failed: duplicate cluster_id ${cluster.cluster_id}.`);
    }
    clusterIds.add(cluster.cluster_id);
    const expectedCount = Number(cluster.case_count ?? 0);
    clusterCaseCountSum += expectedCount;
    const actualCount = membershipCounts.get(cluster.cluster_id) ?? 0;
    if (actualCount !== expectedCount) {
      throw new Error(
        `Import contract failed: cluster ${cluster.cluster_id} case_count=${expectedCount}, actual=${actualCount}.`,
      );
    }
    if (!cluster.digest_source_key) {
      throw new Error(`Import contract failed: cluster ${cluster.cluster_id} has no digest_source_key.`);
    }
    const digestCase = casesBySourceKey.get(cluster.digest_source_key);
    if (!digestCase) {
      throw new Error(`Import contract failed: digest_source_key not found: ${cluster.digest_source_key}.`);
    }
    if (digestCase.clusterId !== cluster.cluster_id) {
      throw new Error(
        `Import contract failed: digest case ${cluster.digest_source_key} is not in cluster ${cluster.cluster_id}.`,
      );
    }
  }

  if (clusterCaseCountSum !== cases.length) {
    throw new Error(`Import contract failed: cluster case_count sum ${clusterCaseCountSum} != cases ${cases.length}.`);
  }
  for (const clusterId of membershipCounts.keys()) {
    if (!clusterIds.has(clusterId)) {
      throw new Error(`Import contract failed: case references missing cluster_id ${clusterId}.`);
    }
  }
}

function vectorLiteral(embedding: number[] | null): string | null {
  return embedding ? `[${embedding.join(",")}]` : null;
}

async function assertTargetTables(pool: Queryable): Promise<void> {
  const result = await pool.query<{ table_name: string }>(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name IN ('precedent_case', 'case_cluster', 'knowledge_page', 'knowledge_page_version')`,
  );
  const found = new Set(result.rows.map((row) => row.table_name));
  for (const table of ["precedent_case", "case_cluster"]) {
    if (!found.has(table)) {
      throw new Error(`Missing required table '${table}'. Run Phase0 schema migration before importing cases.`);
    }
  }
}

async function loadExistingSourceKeys(pool: Queryable, workspaceId: string): Promise<Set<string>> {
  const result = await pool.query<{ source_key: string }>(
    `SELECT source_key
     FROM precedent_case
     WHERE workspace_id = $1::uuid AND source_key IS NOT NULL`,
    [workspaceId],
  );
  return new Set(result.rows.map((row) => row.source_key));
}

async function clearImportedDigestPageLinks(pool: Queryable, workspaceId: string): Promise<void> {
  await pool.query(
    `UPDATE precedent_case
     SET digest_page_id = NULL, updated_at = NOW()
     WHERE workspace_id = $1::uuid
       AND source_key LIKE 'tsvd999/%'`,
    [workspaceId],
  );
}

async function deleteImportedTsvdData(pool: Queryable, workspaceId: string): Promise<void> {
  await pool.query(`DROP TABLE IF EXISTS tmp_imported_tsvd_pages`);
  await pool.query(
    `CREATE TEMP TABLE tmp_imported_tsvd_pages (
       id uuid PRIMARY KEY
     ) ON COMMIT DROP`,
  );
  await pool.query(
    `INSERT INTO tmp_imported_tsvd_pages (id)
     SELECT id
     FROM knowledge_page
     WHERE workspace_id = $1::uuid
       AND source_origin = 'imported-tsvd'`,
    [workspaceId],
  );

  // Delete TSVD rows that reference imported digest pages before deleting the
  // pages themselves. Otherwise ON DELETE SET NULL triggers scan large FK
  // tables page-by-page and the clean import can stall for tens of minutes.
  await pool.query(
    `DELETE FROM case_cluster
     WHERE workspace_id = $1::uuid
       AND (
         digest_page_id IN (SELECT id FROM tmp_imported_tsvd_pages)
         OR digest_case_id IN (
           SELECT id
           FROM precedent_case
           WHERE workspace_id = $1::uuid
             AND source_key LIKE 'tsvd999/%'
         )
         OR numeric_cluster_id IN (
           SELECT DISTINCT cluster_id
           FROM precedent_case
           WHERE workspace_id = $1::uuid
             AND source_key LIKE 'tsvd999/%'
             AND cluster_id IS NOT NULL
         )
       )`,
    [workspaceId],
  );
  await pool.query(
    `DELETE FROM precedent_case
     WHERE workspace_id = $1::uuid
       AND source_key LIKE 'tsvd999/%'`,
    [workspaceId],
  );
  await pool.query(
    `DELETE FROM knowledge_page_version
     WHERE page_id IN (SELECT id FROM tmp_imported_tsvd_pages)`,
  );
  await pool.query(
    `DELETE FROM knowledge_page_tag
     WHERE page_id IN (SELECT id FROM tmp_imported_tsvd_pages)`,
  );
  await pool.query(
    `DELETE FROM knowledge_page_owner
     WHERE page_id IN (SELECT id FROM tmp_imported_tsvd_pages)`,
  );
  await pool.query(
    `DELETE FROM knowledge_claim
     WHERE page_id IN (SELECT id FROM tmp_imported_tsvd_pages)`,
  );
  await pool.query(
    `UPDATE review_request
     SET page_id = NULL
     WHERE page_id IN (SELECT id FROM tmp_imported_tsvd_pages)`,
  );
  await pool.query(
    `UPDATE system
     SET knowledge_page_id = NULL
     WHERE knowledge_page_id IN (SELECT id FROM tmp_imported_tsvd_pages)`,
  );
  await pool.query(
    `DELETE FROM knowledge_page
     WHERE id IN (SELECT id FROM tmp_imported_tsvd_pages)`,
  );
}

async function insertCases(
  pool: Queryable,
  workspaceId: string,
  rows: NormalizedCaseRow[],
  batchSize: number,
  refreshExisting: boolean,
): Promise<number> {
  let inserted = 0;
  for (const batch of chunk(rows, batchSize)) {
    const values: unknown[] = [];
    const tuples = batch.map((row) => {
      const base = values.length;
      values.push(
        workspaceId,
        row.sourceKey,
        row.originalSeq,
        row.higherCategory,
        row.lowerCategory,
        row.appMenu,
        row.processType,
        row.title,
        row.symptom,
        row.cause,
        row.action,
        row.result,
        row.requestCompany,
        row.managerTeam,
        row.clusterId,
        row.clusterLabel,
        row.isDigest,
        row.severity,
        row.resolved,
        row.urgency,
        row.workHours,
        row.requestedAt,
        row.resolvedAt,
        row.sensitivity,
        vectorLiteral(row.embedding),
        JSON.stringify(row.tags),
      );
      const p = Array.from({ length: 26 }, (_unused, i) => `$${base + i + 1}`);
      p[0] = `${p[0]}::uuid`;
      p[24] = `${p[24]}::vector`;
      p[25] = `${p[25]}::jsonb`;
      return `(${p.join(", ")})`;
    });
    const conflictClause = refreshExisting
      ? `ON CONFLICT (workspace_id, source_key) WHERE source_key IS NOT NULL DO UPDATE SET
        original_seq = EXCLUDED.original_seq,
        higher_category = EXCLUDED.higher_category,
        lower_category = EXCLUDED.lower_category,
        app_menu = EXCLUDED.app_menu,
        process_type = EXCLUDED.process_type,
        title = EXCLUDED.title,
        symptom = EXCLUDED.symptom,
        cause = EXCLUDED.cause,
        action = EXCLUDED.action,
        result = EXCLUDED.result,
        request_company = EXCLUDED.request_company,
        manager_team = EXCLUDED.manager_team,
        cluster_id = EXCLUDED.cluster_id,
        cluster_label = EXCLUDED.cluster_label,
        is_digest = EXCLUDED.is_digest,
        severity = EXCLUDED.severity,
        resolved = EXCLUDED.resolved,
        urgency = EXCLUDED.urgency,
        work_hours = EXCLUDED.work_hours,
        requested_at = EXCLUDED.requested_at,
        resolved_at = EXCLUDED.resolved_at,
        sensitivity = EXCLUDED.sensitivity,
        embedding = EXCLUDED.embedding,
        tags = EXCLUDED.tags,
        updated_at = NOW()`
      : `ON CONFLICT (workspace_id, source_key) WHERE source_key IS NOT NULL DO NOTHING`;
    const result = await pool.query(
      `INSERT INTO precedent_case (
        workspace_id, source_key, original_seq, higher_category, lower_category, app_menu, process_type,
        title, symptom, cause, action, result, request_company, manager_team,
        cluster_id, cluster_label, is_digest, severity, resolved, urgency, work_hours,
        requested_at, resolved_at, sensitivity, embedding, tags
      ) VALUES ${tuples.join(", ")}
      ${conflictClause}`,
      values,
    );
    inserted += result.rowCount ?? 0;
  }
  return inserted;
}

interface CaseIdMaps {
  bySourceKey: Map<string, string>;
  byOriginalSeq: Map<number, string>;
}

async function loadCaseIdMaps(
  pool: Queryable,
  workspaceId: string,
): Promise<CaseIdMaps> {
  const result = await pool.query<{ id: string; source_key: string | null; original_seq: number | null }>(
    `SELECT id, source_key, original_seq
     FROM precedent_case
     WHERE workspace_id = $1::uuid`,
    [workspaceId],
  );
  const bySourceKey = new Map<string, string>();
  const byOriginalSeq = new Map<number, string>();
  for (const row of result.rows) {
    if (row.source_key) {
      bySourceKey.set(row.source_key, row.id);
    }
    if (row.original_seq !== null && row.original_seq !== undefined && !byOriginalSeq.has(Number(row.original_seq))) {
      byOriginalSeq.set(Number(row.original_seq), row.id);
    }
  }
  return { bySourceKey, byOriginalSeq };
}

async function upsertClusters(
  pool: Queryable,
  workspaceId: string,
  clusters: ClusterRecord[],
  caseIds: CaseIdMaps,
): Promise<number> {
  let count = 0;
  for (const cluster of clusters) {
    const digestCaseId = cluster.digest_source_key
      ? caseIds.bySourceKey.get(cluster.digest_source_key) ?? null
      : cluster.digest_original_seq === null || cluster.digest_original_seq === undefined
        ? null
        : caseIds.byOriginalSeq.get(Number(cluster.digest_original_seq)) ?? null;
    await pool.query(
      `INSERT INTO case_cluster (
        workspace_id, numeric_cluster_id, label, description, case_count, digest_case_id,
        top_symptoms, top_actions
      ) VALUES ($1::uuid, $2, $3, $4, $5, $6::uuid, $7::jsonb, $8::jsonb)
      ON CONFLICT (workspace_id, numeric_cluster_id) DO UPDATE SET
        label = EXCLUDED.label,
        description = EXCLUDED.description,
        case_count = EXCLUDED.case_count,
        digest_case_id = EXCLUDED.digest_case_id,
        top_symptoms = EXCLUDED.top_symptoms,
        top_actions = EXCLUDED.top_actions,
        updated_at = NOW()`,
      [
        workspaceId,
        cluster.cluster_id,
        cluster.label,
        cluster.description ?? cluster.label,
        cluster.case_count ?? 0,
        digestCaseId,
        JSON.stringify(cluster.top_symptoms ?? []),
        JSON.stringify(cluster.top_actions ?? []),
      ],
    );
    count += 1;
  }
  return count;
}

function slugForCluster(cluster: Pick<ClusterRecord, "cluster_id" | "label">): string {
  const hash = createHash("sha1").update(cluster.label).digest("hex").slice(0, 8);
  return `tsvd999-case-${cluster.cluster_id}-${hash}`;
}

export function buildDigestMarkdown(
  cluster: Pick<ClusterRecord, "cluster_id" | "label" | "case_count" | "top_symptoms" | "top_actions">,
  digest: Pick<RawCaseRecord, "title" | "symptom" | "action" | "result"> | undefined,
): string {
  const lines = [
    `# ${cluster.label}`,
    "",
    `- 클러스터 ID: ${cluster.cluster_id}`,
    `- 사례 수: ${cluster.case_count ?? 0}`,
    "",
    "## 대표 사례",
    "",
    `- 제목: ${stringOrNull(digest?.title) ?? "(제목 없음)"}`,
    `- 증상: ${stringOrNull(digest?.symptom) ?? "정리된 증상 없음"}`,
    `- 조치: ${stringOrNull(digest?.action) ?? "정리된 조치 없음"}`,
    `- 결과: ${stringOrNull(digest?.result) ?? "info_only"}`,
    "",
    "## 주요 증상",
    ...(cluster.top_symptoms ?? []).map((item) => `- ${item}`),
    "",
    "## 주요 조치",
    ...(cluster.top_actions ?? []).map((item) => `- ${item}`),
  ];
  return `${lines.join("\n")}\n`;
}

async function upsertDigestPages(
  pool: Queryable,
  workspaceId: string,
  clusters: ClusterRecord[],
  cases: RawCaseRecord[],
): Promise<number> {
  let count = 0;
  const caseBySourceKey = new Map(
    cases
      .filter((record) => typeof record.source_key === "string" && record.source_key)
      .map((record) => [record.source_key as string, record]),
  );
  const caseBySeq = new Map(
    cases
      .filter((record) => typeof record.original_seq === "number")
      .map((record) => [record.original_seq as number, record]),
  );

  for (const cluster of clusters) {
    const sourceKey = `tsvd999/cluster/${cluster.cluster_id}`;
    const title = cluster.label;
    const page = await pool.query<{ id: string }>(
      `INSERT INTO knowledge_page (
        workspace_id, page_type, title, slug, summary, sensitivity,
        publish_status, source_type, source_key, surface, authority, source_origin
      ) VALUES (
        $1::uuid, 'incident_pattern', $2, $3, $4, 'INTERNAL',
        'published', 'imported-tsvd', $5, 'case', 'generated', 'imported-tsvd'
      )
      ON CONFLICT (workspace_id, source_type, source_key) WHERE source_type IS NOT NULL
      DO UPDATE SET
        title = EXCLUDED.title,
        summary = EXCLUDED.summary,
        updated_at = NOW()
      RETURNING id`,
      [
        workspaceId,
        title,
        slugForCluster(cluster),
        cluster.description ?? title,
        sourceKey,
      ],
    );
    const pageId = page.rows[0]?.id;
    if (!pageId) continue;
    const digest = cluster.digest_source_key
      ? caseBySourceKey.get(cluster.digest_source_key)
      : cluster.digest_original_seq
        ? caseBySeq.get(Number(cluster.digest_original_seq))
        : undefined;
    const mdx = buildDigestMarkdown(cluster, digest);
    const frontmatter = JSON.stringify({
      surface: "case",
      page_type: "incident_pattern",
      source_origin: "imported-tsvd",
      source_key: sourceKey,
    });
    const version = await pool.query(
      `UPDATE knowledge_page_version
       SET title = $2,
           mdx_content = $3,
           frontmatter = $4::jsonb,
           change_note = 'TSVD999 digest import refresh'
       WHERE page_id = $1::uuid
         AND version_number = 1`,
      [pageId, title, mdx, frontmatter],
    );
    if ((version.rowCount ?? 0) === 0) {
      await pool.query(
        `INSERT INTO knowledge_page_version (
          page_id, version_number, title, mdx_content, frontmatter, change_note, created_at
        ) VALUES ($1::uuid, 1, $2, $3, $4::jsonb, 'TSVD999 digest import', NOW())`,
        [pageId, title, mdx, frontmatter],
      );
    }
    await pool.query(
      `UPDATE case_cluster
       SET digest_page_id = $3::uuid, updated_at = NOW()
       WHERE workspace_id = $1::uuid
         AND numeric_cluster_id = $2`,
      [workspaceId, cluster.cluster_id, pageId],
    );
    if (cluster.digest_source_key) {
      await pool.query(
        `UPDATE precedent_case
         SET digest_page_id = $3::uuid, updated_at = NOW()
         WHERE workspace_id = $1::uuid
           AND source_key = $2`,
        [workspaceId, cluster.digest_source_key, pageId],
      );
    }
    count += 1;
  }
  return count;
}

function parseArgs(argv: string[]): ImportOptions {
  const args = new Map<string, string | boolean>();
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token?.startsWith("--")) continue;
    const [key, inline] = token.slice(2).split("=", 2);
    if (inline !== undefined) {
      args.set(key, inline);
      continue;
    }
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args.set(key, next);
      i += 1;
    } else {
      args.set(key, true);
    }
  }
  const workspaceId = args.get("workspace-id");
  if (typeof workspaceId !== "string" || !workspaceId) {
    throw new Error("Missing required --workspace-id <uuid>");
  }
  const batchSize = Number(args.get("batch-size") ?? 500);
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > MAX_BATCH_SIZE) {
    throw new Error(`Invalid --batch-size ${String(args.get("batch-size") ?? 500)}. Use 1-${MAX_BATCH_SIZE}.`);
  }
  return {
    workspaceId,
    casesPath: String(args.get("cases") ?? DEFAULT_CASES_PATH),
    clustersPath: String(args.get("clusters") ?? DEFAULT_CLUSTERS_PATH),
    batchSize,
    dryRun: args.has("dry-run"),
    createDigests: args.has("create-digests"),
    refreshExisting: args.has("refresh-existing"),
    replaceImportedTsvd: args.has("replace-imported-tsvd"),
  };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (!process.env.DATABASE_URL) {
    throw new Error("Missing DATABASE_URL in environment");
  }
  const rawCases = await readJsonl(options.casesPath);
  const normalized = rawCases.map(normalizeCaseRow);
  const clusters = await readClusters(options.clustersPath);
  validateImportContract(normalized, clusters);
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await assertTargetTables(pool);
    const existing = options.replaceImportedTsvd ? new Set<string>() : await loadExistingSourceKeys(pool, options.workspaceId);
    const rowsToWrite = options.refreshExisting
      ? normalized
      : normalized.filter((row) => !existing.has(row.sourceKey));
    if (options.dryRun) {
      console.log(
        JSON.stringify(
          {
            dryRun: true,
            casesRead: normalized.length,
            casesToInsert: rowsToWrite.length,
            clusters: clusters.length,
            createDigests: options.createDigests,
            refreshExisting: options.refreshExisting,
            replaceImportedTsvd: options.replaceImportedTsvd,
          },
          null,
          2,
        ),
      );
      return;
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      if (options.replaceImportedTsvd) {
        await deleteImportedTsvdData(client, options.workspaceId);
      } else if (options.refreshExisting || options.createDigests) {
        await clearImportedDigestPageLinks(client, options.workspaceId);
      }
      const insertedCases = await insertCases(
        client,
        options.workspaceId,
        rowsToWrite,
        options.batchSize,
        options.refreshExisting,
      );
      const caseIds = await loadCaseIdMaps(client, options.workspaceId);
      const upsertedClusters = await upsertClusters(client, options.workspaceId, clusters, caseIds);
      const digestPages = options.createDigests
        ? await upsertDigestPages(client, options.workspaceId, clusters, rawCases)
        : 0;
      await client.query("COMMIT");
      console.log(
        JSON.stringify(
          {
            insertedCases,
            skippedExistingCases: options.refreshExisting ? 0 : normalized.length - rowsToWrite.length,
            refreshExisting: options.refreshExisting,
            replaceImportedTsvd: options.replaceImportedTsvd,
            upsertedClusters,
            digestPages,
          },
          null,
          2,
        ),
      );
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

const isMain = process.argv[1]?.endsWith("import-cases-to-jarvis.ts") ?? false;
if (isMain) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}

