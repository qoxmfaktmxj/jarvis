#!/usr/bin/env tsx
// scripts/translate-wiki-titles.ts
// 기존 영어 title을 한국어로 일괄 변환하는 스크립트.
//
// 사용법:
//   pnpm tsx scripts/translate-wiki-titles.ts \
//     [--dry-run] \
//     [--workspace-id <uuid>] \
//     [--limit <n>]
//
// 전제:
//   - .env에 DATABASE_URL, OPENAI_API_KEY 설정
//   - WIKI_ROOT 환경변수 또는 기본값 ./wiki

import 'dotenv/config';
import * as path from 'node:path';
import { Pool } from 'pg';
import OpenAI from 'openai';
import { readPage, parseFrontmatter, serializeFrontmatter, atomicWrite, wikiRoot } from '../packages/wiki-fs/src/index.js';

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

const DRY_RUN = hasFlag('--dry-run');
const WORKSPACE_ID = getArg('--workspace-id');
const parsedLimit = Number.parseInt(getArg('--limit') ?? '100', 10);
const LIMIT = Number.isFinite(parsedLimit) && parsedLimit > 0
  ? Math.min(parsedLimit, 500)
  : 100;

// ---------------------------------------------------------------------------
// ASCII-only 판별 (한국어/일본어/중국어 등 비-ASCII 없으면 영어로 간주)
// ---------------------------------------------------------------------------
function isAsciiOnly(str: string): boolean {
  // eslint-disable-next-line no-control-regex
  return /^[\x00-\x7F]+$/.test(str);
}

function toWorkspaceRelPath(workspaceId: string, indexedPath: string): string {
  const normalized = indexedPath.replace(/\\/g, "/").replace(/^\/+/, "");
  const prefix = `wiki/${workspaceId}/`;
  const relPath = normalized.startsWith(prefix)
    ? normalized.slice(prefix.length)
    : normalized;

  if (relPath.split("/").some((seg) => seg === "..")) {
    throw new Error(`Unsafe wiki path: ${indexedPath}`);
  }

  return relPath;
}

// ---------------------------------------------------------------------------
// OpenAI로 한국어 번역
// ---------------------------------------------------------------------------
const openai = new OpenAI({ apiKey: process.env['OPENAI_API_KEY'] });

async function translateTitle(englishTitle: string): Promise<string> {
  const response = await openai.chat.completions.create({
    model: 'gpt-5.4-mini',
    temperature: 0.1,
    max_tokens: 200,
    messages: [
      {
        role: 'system',
        content: [
          '당신은 사내 위키 페이지 제목을 한국어로 번역하는 전문가입니다.',
          '',
          '규칙:',
          '- 영문 고유명사(제품명, 기술 용어, 인명 등)는 괄호로 병기한다.',
          '  예: "MindVault Overview" → "마인드볼트(MindVault) 개요"',
          '  예: "Annual Leave Policy" → "연차 휴가 정책"',
          '  예: "Docker Container Best Practices" → "도커(Docker) 컨테이너 모범 사례"',
          '- 번역 결과만 출력한다. 따옴표나 설명 없이 제목 텍스트만.',
          '- 200자 미만으로 유지한다.',
        ].join('\n'),
      },
      {
        role: 'user',
        content: englishTitle,
      },
    ],
  });

  const translated = response.choices[0]?.message?.content?.trim() ?? englishTitle;
  // 200자 varchar 제한 안전장치
  return translated.length > 195 ? translated.slice(0, 195) : translated;
}

// ---------------------------------------------------------------------------
// 메인
// ---------------------------------------------------------------------------
async function main() {
  if (!process.env['DATABASE_URL']) {
    throw new Error('DATABASE_URL is not set. Add it to .env or export it.');
  }
  if (!process.env['OPENAI_API_KEY']) {
    throw new Error('OPENAI_API_KEY is not set. Add it to .env or export it.');
  }

  const pg = new Pool({ connectionString: process.env['DATABASE_URL'] });

  try {
    // 1. ASCII-only title 행 조회
    let query = `
      SELECT id, workspace_id, path, title
      FROM wiki_page_index
      WHERE title ~ '^[\\x20-\\x7E]+$'
        AND published_status = 'published'
    `;
    const params: Array<string | number> = [];

    if (WORKSPACE_ID) {
      params.push(WORKSPACE_ID);
      query += ` AND workspace_id = $${params.length}::uuid`;
    }

    query += ` ORDER BY updated_at DESC`;
    params.push(LIMIT);
    query += ` LIMIT $${params.length}`;

    const result = await pg.query(query, params);
    const rows = result.rows as Array<{
      id: string;
      workspace_id: string;
      path: string;
      title: string;
    }>;

    console.log(`\n[translate-wiki-titles] Found ${rows.length} ASCII-only title(s)\n`);

    if (rows.length === 0) {
      console.log('Nothing to translate. Exiting.');
      return;
    }

    let translated = 0;
    let skipped = 0;
    let errors = 0;

    for (const row of rows) {
      const label = `[${row.workspace_id.slice(0, 8)}] ${row.path}`;

      try {
        const relPath = toWorkspaceRelPath(row.workspace_id, row.path);

        // 2. 디스크에서 실제 frontmatter 확인
        let diskContent: string;
        try {
          diskContent = await readPage(row.workspace_id, relPath);
        } catch {
          console.log(`  SKIP ${label} — file not found on disk`);
          skipped++;
          continue;
        }

        const { data: fm, body } = parseFrontmatter(diskContent);

        // 디스크 title도 ASCII-only인지 확인
        if (!isAsciiOnly(fm.title)) {
          console.log(`  SKIP ${label} — disk title already non-ASCII: "${fm.title}"`);
          skipped++;
          continue;
        }

        // 3. 번역
        const koreanTitle = await translateTitle(fm.title);
        console.log(`  "${fm.title}" → "${koreanTitle}"`);

        if (isAsciiOnly(koreanTitle)) {
          console.log(`  SKIP ${label} — translated title is still ASCII-only`);
          skipped++;
          continue;
        }

        if (DRY_RUN) {
          translated++;
          continue;
        }

        // 4. 디스크 파일 업데이트
        const updatedFm = { ...fm, title: koreanTitle };
        // aliases에 영어 원문 title 추가 (이미 없으면)
        const currentAliases = updatedFm.aliases ?? [];
        if (!currentAliases.includes(fm.title)) {
          updatedFm.aliases = [...currentAliases, fm.title];
        }

        const newContent = serializeFrontmatter(updatedFm, body);
        const absPath = path.join(wikiRoot(), row.workspace_id, relPath);
        await atomicWrite(absPath, newContent);

        // 5. DB 동기화
        await pg.query(
          `UPDATE wiki_page_index
           SET title = $1, frontmatter = frontmatter || $2::jsonb, updated_at = NOW()
           WHERE id = $3::uuid AND workspace_id = $4::uuid`,
          [
            koreanTitle,
            JSON.stringify({ title: koreanTitle, aliases: updatedFm.aliases }),
            row.id,
            row.workspace_id,
          ],
        );

        translated++;
      } catch (err) {
        console.error(`  ERROR ${label}:`, err instanceof Error ? err.message : err);
        errors++;
      }
    }

    console.log(`\n[translate-wiki-titles] Done.`);
    console.log(`  Translated: ${translated}`);
    console.log(`  Skipped:    ${skipped}`);
    console.log(`  Errors:     ${errors}`);
    if (DRY_RUN) {
      console.log(`  (DRY RUN — no files or DB rows were modified)`);
    }
  } finally {
    await pg.end();
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
