#!/usr/bin/env tsx
// scripts/seed-canonical.ts
// data/canonical/*.md → knowledge_page + knowledge_page_version (PostgreSQL)
//
// 사용법:
//   pnpm tsx scripts/seed-canonical.ts \
//     --dir data/canonical \
//     --workspace-id <uuid> \
//     [--dry-run] \
//     [--batch-size 50]
//
// 전제:
//   - canonicalize-guidebook.ts 실행 후 data/canonical/{slug}.md 존재
//   - .env 에 DATABASE_URL 설정

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';

// ---------------------------------------------------------------------------
// CLI 인자 파싱
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);

function getArg(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] : undefined;
}

function hasFlag(flag: string): boolean {
  return args.includes(flag);
}

const DIR = getArg('--dir') ?? 'data/canonical';
const WORKSPACE_ID = getArg('--workspace-id');
const DRY_RUN = hasFlag('--dry-run');
const BATCH_SIZE = parseInt(getArg('--batch-size') ?? '50', 10);

// ---------------------------------------------------------------------------
// 타입 정의
// ---------------------------------------------------------------------------
interface CanonicalFrontmatter {
  title: string;
  slug: string;
  domain: string;
  page_type: string;
  surface: string;
  authority: string;
  owner_team?: string;
  audience: string;
  sensitivity: string;
  source_origin?: string;
  source_key: string;
  status?: string;
  last_verified_at?: string;
  review_cycle_days?: number;
  [key: string]: unknown;
}

interface ParsedCanonicalFile {
  frontmatter: CanonicalFrontmatter;
  body: string;
  filePath: string;
  fileName: string;
}

interface SeedResult {
  seeded: number;
  updated: number;
  skipped: number;
}

// ---------------------------------------------------------------------------
// 프론트매터 파서 (외부 라이브러리 없이 regex 기반)
// ---------------------------------------------------------------------------
function parseFrontmatter(raw: string): { frontmatter: Record<string, unknown>; body: string } {
  const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!fmMatch) {
    return { frontmatter: {}, body: raw };
  }

  const yamlBlock = fmMatch[1];
  const body = fmMatch[2].trimStart();
  const frontmatter: Record<string, unknown> = {};

  // 한 줄씩 파싱. 지원 형식:
  //   key: "quoted value"
  //   key: unquoted value
  //   key: 123
  for (const line of yamlBlock.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;

    const key = trimmed.slice(0, colonIdx).trim();
    const rawValue = trimmed.slice(colonIdx + 1).trim();

    // quoted string
    if ((rawValue.startsWith('"') && rawValue.endsWith('"')) ||
        (rawValue.startsWith("'") && rawValue.endsWith("'"))) {
      frontmatter[key] = rawValue.slice(1, -1);
      continue;
    }

    // integer
    if (/^\d+$/.test(rawValue)) {
      frontmatter[key] = parseInt(rawValue, 10);
      continue;
    }

    // boolean
    if (rawValue === 'true') { frontmatter[key] = true; continue; }
    if (rawValue === 'false') { frontmatter[key] = false; continue; }

    // null / empty
    if (rawValue === '' || rawValue === 'null' || rawValue === '~') {
      frontmatter[key] = null;
      continue;
    }

    frontmatter[key] = rawValue;
  }

  return { frontmatter, body };
}

// ---------------------------------------------------------------------------
// 파일 로딩 + 유효성 검사
// ---------------------------------------------------------------------------
function loadCanonicalFiles(dir: string): ParsedCanonicalFile[] {
  if (!fs.existsSync(dir)) {
    throw new Error(`Directory not found: ${dir}`);
  }

  const files = fs.readdirSync(dir)
    .filter((f) => f.endsWith('.md') && !f.startsWith('_'));

  const result: ParsedCanonicalFile[] = [];

  for (const fileName of files) {
    const filePath = path.resolve(dir, fileName);
    const raw = fs.readFileSync(filePath, 'utf-8');
    const { frontmatter, body } = parseFrontmatter(raw);

    // 필수 필드 검증
    const fm = frontmatter as Record<string, unknown>;
    if (!fm['title'] || !fm['slug'] || !fm['source_key']) {
      console.warn(`  [WARN] ${fileName}: missing required frontmatter fields (title/slug/source_key) — skipping`);
      continue;
    }

    result.push({
      frontmatter: {
        title: String(fm['title'] ?? ''),
        slug: String(fm['slug'] ?? ''),
        domain: String(fm['domain'] ?? 'general'),
        page_type: String(fm['page_type'] ?? 'guide'),
        surface: String(fm['surface'] ?? 'canonical'),
        authority: String(fm['authority'] ?? 'imported'),
        owner_team: fm['owner_team'] != null ? String(fm['owner_team']) : undefined,
        audience: String(fm['audience'] ?? 'all-employees'),
        sensitivity: String(fm['sensitivity'] ?? 'INTERNAL'),
        source_origin: fm['source_origin'] != null ? String(fm['source_origin']) : undefined,
        source_key: String(fm['source_key']),
        status: fm['status'] != null ? String(fm['status']) : undefined,
        last_verified_at: fm['last_verified_at'] != null ? String(fm['last_verified_at']) : undefined,
        review_cycle_days: typeof fm['review_cycle_days'] === 'number' ? fm['review_cycle_days'] : 90,
      },
      body,
      filePath,
      fileName,
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// 요약 생성 (본문 첫 200자)
// ---------------------------------------------------------------------------
function buildSummary(body: string): string {
  const text = body
    .replace(/#{1,6}\s+/g, '')       // markdown 헤딩 제거
    .replace(/[*_`~]/g, '')           // 인라인 마크업 제거
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // 링크 텍스트만 남김
    .replace(/\s+/g, ' ')
    .trim();

  if (text.length <= 200) return text;
  // 단어 경계에서 자름
  const truncated = text.slice(0, 200);
  const lastSpace = truncated.lastIndexOf(' ');
  return (lastSpace > 150 ? truncated.slice(0, lastSpace) : truncated) + '…';
}

// ---------------------------------------------------------------------------
// 슬러그 충돌 해결 (같은 workspace에서 다른 source_key가 같은 slug 점유 시)
// ---------------------------------------------------------------------------
async function resolveSlug(
  pg: Pool,
  workspaceId: string,
  slug: string,
  sourceKey: string,
): Promise<string> {
  // 이미 이 source_key 로 등록된 row의 slug는 그대로 반환
  const existing = await pg.query<{ slug: string }>(
    `SELECT slug FROM knowledge_page
     WHERE workspace_id = $1 AND source_type = 'guidebook' AND source_key = $2
     LIMIT 1`,
    [workspaceId, sourceKey],
  );
  if (existing.rows.length > 0) {
    return existing.rows[0].slug;
  }

  // 충돌 확인 후 -2, -3, ... 접미사 추가
  let candidate = slug;
  let suffix = 1;
  while (true) {
    const collision = await pg.query<{ id: string }>(
      `SELECT id FROM knowledge_page
       WHERE workspace_id = $1 AND slug = $2
       LIMIT 1`,
      [workspaceId, candidate],
    );
    if (collision.rows.length === 0) break;
    suffix += 1;
    candidate = `${slug}-${suffix}`;
  }
  return candidate;
}

// ---------------------------------------------------------------------------
// 단일 파일 처리
// ---------------------------------------------------------------------------
async function seedFile(
  pg: Pool,
  parsed: ParsedCanonicalFile,
  workspaceId: string,
  isDryRun: boolean,
): Promise<'seeded' | 'updated' | 'skipped'> {
  const { frontmatter: fm, body } = parsed;
  const summary = buildSummary(body);

  const resolvedSlug = isDryRun
    ? fm.slug
    : await resolveSlug(pg, workspaceId, fm.slug, fm.source_key);

  const lastVerifiedAt = fm.last_verified_at ? new Date(fm.last_verified_at) : null;

  if (isDryRun) {
    console.log(`  [dry-run] ${fm.slug}: title="${fm.title}" source_key="${fm.source_key}"`);
    return 'seeded';
  }

  // --- knowledge_page upsert ---
  const upsertResult = await pg.query<{ id: string; xmax: string }>(
    `INSERT INTO knowledge_page (
       id, workspace_id, page_type, title, slug, summary,
       sensitivity, publish_status,
       source_type, source_key,
       surface, authority,
       owner_team, audience,
       review_cycle_days, domain, source_origin,
       last_verified_at,
       created_at, updated_at
     ) VALUES (
       gen_random_uuid(), $1, $2, $3, $4, $5,
       $6, 'draft',
       'guidebook', $7,
       $8, $9,
       $10, $11,
       $12, $13, $14,
       $15,
       NOW(), NOW()
     )
     ON CONFLICT (workspace_id, source_type, source_key) WHERE source_type IS NOT NULL
     DO UPDATE SET
       title            = EXCLUDED.title,
       summary          = EXCLUDED.summary,
       slug             = EXCLUDED.slug,
       sensitivity      = EXCLUDED.sensitivity,
       surface          = EXCLUDED.surface,
       authority        = EXCLUDED.authority,
       owner_team       = EXCLUDED.owner_team,
       audience         = EXCLUDED.audience,
       review_cycle_days = EXCLUDED.review_cycle_days,
       domain           = EXCLUDED.domain,
       source_origin    = EXCLUDED.source_origin,
       last_verified_at = EXCLUDED.last_verified_at,
       updated_at       = NOW()
     RETURNING id, xmax::text`,
    [
      workspaceId,
      fm.page_type,
      fm.title,
      resolvedSlug,
      summary,
      fm.sensitivity,
      fm.source_key,
      fm.surface,
      fm.authority,
      fm.owner_team ?? null,
      fm.audience,
      fm.review_cycle_days ?? 90,
      fm.domain,
      fm.source_origin ?? null,
      lastVerifiedAt,
    ],
  );

  const row = upsertResult.rows[0];
  if (!row) {
    console.warn(`  [WARN] upsert returned no row for ${fm.slug}`);
    return 'skipped';
  }

  const pageId = row.id;
  // xmax = 0 → INSERT (new row), xmax > 0 → UPDATE (existing row)
  const isNew = row.xmax === '0';

  // --- knowledge_page_version ---
  if (isNew) {
    // 신규: version_number = 1
    await pg.query(
      `INSERT INTO knowledge_page_version (
         id, page_id, version_number, title, mdx_content, frontmatter,
         change_note, created_at
       ) VALUES (
         $1, $2, 1, $3, $4, $5::jsonb,
         'guidebook import', NOW()
       )
       ON CONFLICT DO NOTHING`,
      [
        randomUUID(),
        pageId,
        fm.title,
        body,
        JSON.stringify(fm as Record<string, unknown>),
      ],
    );
    return 'seeded';
  } else {
    // 기존: version_number 증가
    const maxVerResult = await pg.query<{ max_ver: number }>(
      `SELECT COALESCE(MAX(version_number), 0) AS max_ver
       FROM knowledge_page_version
       WHERE page_id = $1`,
      [pageId],
    );
    const nextVer = (maxVerResult.rows[0]?.max_ver ?? 0) + 1;

    await pg.query(
      `INSERT INTO knowledge_page_version (
         id, page_id, version_number, title, mdx_content, frontmatter,
         change_note, created_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6::jsonb,
         'guidebook re-import', NOW()
       )`,
      [
        randomUUID(),
        pageId,
        nextVer,
        fm.title,
        body,
        JSON.stringify(fm as Record<string, unknown>),
      ],
    );
    return 'updated';
  }
}

// ---------------------------------------------------------------------------
// 배치 처리
// ---------------------------------------------------------------------------
async function processBatch(
  pg: Pool,
  batch: ParsedCanonicalFile[],
  workspaceId: string,
  isDryRun: boolean,
  offset: number,
  total: number,
  result: SeedResult,
): Promise<void> {
  for (let i = 0; i < batch.length; i++) {
    const parsed = batch[i];
    const globalIdx = offset + i + 1;
    const label = parsed.frontmatter.slug;

    try {
      const outcome = await seedFile(pg, parsed, workspaceId, isDryRun);
      console.log(`  [${globalIdx}/${total}] ${label} → ${outcome}`);
      result[outcome]++;
    } catch (err) {
      console.error(`  [${globalIdx}/${total}] ${label} → ERROR: ${(err as Error).message}`);
      result.skipped++;
    }
  }
}

// ---------------------------------------------------------------------------
// 메인 실행
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  // 환경 변수 확인
  if (!process.env['DATABASE_URL']) {
    throw new Error('DATABASE_URL is not set. Add it to .env or export it.');
  }

  if (!WORKSPACE_ID) {
    throw new Error(
      'Missing --workspace-id <uuid>. ' +
      'Run: pnpm tsx scripts/seed-canonical.ts --workspace-id <uuid>',
    );
  }

  // UUID 형식 간단 검증
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(WORKSPACE_ID)) {
    throw new Error(`--workspace-id is not a valid UUID: ${WORKSPACE_ID}`);
  }

  console.log('='.repeat(60));
  console.log('Jarvis Canonical Seed');
  console.log(`  dir          : ${DIR}`);
  console.log(`  workspace-id : ${WORKSPACE_ID}`);
  console.log(`  dry-run      : ${DRY_RUN}`);
  console.log(`  batch-size   : ${BATCH_SIZE}`);
  console.log('='.repeat(60));

  // 파일 로딩
  const allFiles = loadCanonicalFiles(DIR);
  console.log(`\nFound ${allFiles.length} canonical .md file(s) in ${DIR}\n`);

  if (allFiles.length === 0) {
    console.log('Nothing to seed.');
    return;
  }

  const pg = new Pool({ connectionString: process.env['DATABASE_URL'] });

  const result: SeedResult = { seeded: 0, updated: 0, skipped: 0 };

  try {
    // 배치 단위로 순차 처리
    for (let batchStart = 0; batchStart < allFiles.length; batchStart += BATCH_SIZE) {
      const batch = allFiles.slice(batchStart, batchStart + BATCH_SIZE);
      const batchNum = Math.floor(batchStart / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(allFiles.length / BATCH_SIZE);
      console.log(`--- Batch ${batchNum}/${totalBatches} (files ${batchStart + 1}–${batchStart + batch.length}) ---`);

      await processBatch(pg, batch, WORKSPACE_ID, DRY_RUN, batchStart, allFiles.length, result);
    }
  } finally {
    await pg.end();
  }

  // 최종 요약
  console.log('\n' + '='.repeat(60));
  if (DRY_RUN) {
    console.log('[DRY-RUN] No changes written to database.');
  }
  console.log(`seeded: ${result.seeded}, updated: ${result.updated}, skipped: ${result.skipped}`);
  console.log('='.repeat(60));
}

main().catch((err) => {
  console.error('SEED FAILED:', err);
  process.exit(1);
});
