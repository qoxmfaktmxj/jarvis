#!/usr/bin/env tsx
// scripts/canonicalize-guidebook.ts
// Guidebook 정제 스크립트 — isu-guidebook-full.md를 4-surface 구조로 분해
//
// 사용법:
//   pnpm tsx scripts/canonicalize-guidebook.ts \
//     --full data/guidebook/isu-guidebook-full.md \
//     --home data/guidebook/isu-guidebook-home.md \
//     --out data/canonical
//
// 산출물:
//   data/canonical/{slug}.md  — frontmatter 포함 canonical 페이지
//   data/directory/tools.json — 시스템 링크·양식·담당자 목록

import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// CLI 인자 파싱
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
function getArg(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] : undefined;
}

const FULL_MD = getArg('--full') ?? 'data/guidebook/isu-guidebook-full.md';
const HOME_MD = getArg('--home') ?? 'data/guidebook/isu-guidebook-home.md';
const OUT_DIR = getArg('--out') ?? 'data/canonical';
const DIR_OUT = getArg('--dir-out') ?? 'data/directory';

// ---------------------------------------------------------------------------
// 카테고리 트리 (home.md 기반 수동 정의 — 파싱보다 안정적)
// ---------------------------------------------------------------------------
const CATEGORY_MAP: Record<string, { domain: string; ownerTeam?: string; pageType: string }> = {
  '회사소개': { domain: 'company', pageType: 'guide', ownerTeam: '경영지원팀' },
  '그룹소개': { domain: 'company', pageType: 'guide', ownerTeam: '경영지원팀' },
  '조직도': { domain: 'company', pageType: 'guide', ownerTeam: '경영지원팀' },
  '인사제도': { domain: 'hr', pageType: 'policy', ownerTeam: '경영지원팀' },
  '평가제도': { domain: 'hr', pageType: 'policy', ownerTeam: '경영지원팀' },
  '급여': { domain: 'hr', pageType: 'policy', ownerTeam: '경영지원팀' },
  '퇴직연금': { domain: 'hr', pageType: 'procedure', ownerTeam: '경영지원팀' },
  '연말정산': { domain: 'hr', pageType: 'procedure', ownerTeam: '경영지원팀' },
  '교육': { domain: 'hr', pageType: 'guide', ownerTeam: '인재육성팀' },
  '근태': { domain: 'hr', pageType: 'procedure', ownerTeam: '경영지원팀' },
  '출장': { domain: 'admin', pageType: 'procedure', ownerTeam: '경영지원팀' },
  '경비': { domain: 'admin', pageType: 'procedure', ownerTeam: '경영지원팀' },
  '증명서': { domain: 'admin', pageType: 'procedure', ownerTeam: '경영지원팀' },
  '시설': { domain: 'facility', pageType: 'guide', ownerTeam: '총무팀' },
  '회의실': { domain: 'facility', pageType: 'procedure', ownerTeam: '총무팀' },
  '주차': { domain: 'facility', pageType: 'guide', ownerTeam: '총무팀' },
  'IT': { domain: 'it', pageType: 'guide', ownerTeam: '전산팀' },
  '보안': { domain: 'it', pageType: 'policy', ownerTeam: '전산팀' },
  '온보딩': { domain: 'onboarding', pageType: 'onboarding', ownerTeam: '인재육성팀' },
  '입사': { domain: 'onboarding', pageType: 'onboarding', ownerTeam: '경영지원팀' },
  '복리후생': { domain: 'welfare', pageType: 'guide', ownerTeam: '경영지원팀' },
  '복지': { domain: 'welfare', pageType: 'guide', ownerTeam: '경영지원팀' },
  '동호회': { domain: 'welfare', pageType: 'guide', ownerTeam: '총무팀' },
  'FAQ': { domain: 'hr', pageType: 'faq', ownerTeam: '경영지원팀' },
};

// ---------------------------------------------------------------------------
// 링크/시스템 패턴 (directory surface 판별)
// ---------------------------------------------------------------------------
const TOOL_PATTERNS = [
  /이수\s*HR/,
  /그룹웨어/,
  /ERP/,
  /슬랙|Slack/,
  /줌|Zoom/,
  /지라|Jira/,
  /컨플루언스|Confluence/,
  /github|GitHub/,
];

// Stub 판별: 본문이 너무 짧거나 의미 없는 페이지
const MIN_CONTENT_LENGTH = 80;

// ---------------------------------------------------------------------------
// 핵심 유틸
// ---------------------------------------------------------------------------
function slugify(text: string): string {
  return text
    .trim()
    .replace(/[\s/\\:*?"<>|]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

function inferMeta(heading: string): {
  domain: string;
  pageType: string;
  ownerTeam?: string;
} {
  for (const [keyword, meta] of Object.entries(CATEGORY_MAP)) {
    if (heading.includes(keyword)) return meta;
  }
  return { domain: 'general', pageType: 'guide' };
}

function isDirectoryContent(content: string): boolean {
  const linkCount = (content.match(/https?:\/\//g) ?? []).length;
  const toolCount = TOOL_PATTERNS.filter((p) => p.test(content)).length;
  // 링크가 본문보다 많거나, 도구 이름이 3개 이상 등장하면 directory
  return linkCount > 3 || (toolCount >= 2 && content.length < 300);
}

function isStub(content: string): boolean {
  const stripped = content.replace(/\s+/g, ' ').trim();
  return stripped.length < MIN_CONTENT_LENGTH;
}

function buildFrontmatter(
  title: string,
  slug: string,
  meta: { domain: string; pageType: string; ownerTeam?: string },
): string {
  return [
    '---',
    `title: "${title}"`,
    `slug: "${slug}"`,
    `domain: "${meta.domain}"`,
    `page_type: "${meta.pageType}"`,
    `surface: "canonical"`,
    `authority: "imported"`,
    meta.ownerTeam ? `owner_team: "${meta.ownerTeam}"` : '',
    `audience: "all-employees"`,
    `sensitivity: "INTERNAL"`,
    `source_origin: "imported-notion"`,
    `source_key: "guidebook/${slug}"`,
    `status: "needs-review"`,
    `last_verified_at: "${new Date().toISOString().slice(0, 10)}"`,
    `review_cycle_days: 90`,
    '---',
  ]
    .filter(Boolean)
    .join('\n');
}

// ---------------------------------------------------------------------------
// 분할: ## 헤딩 기준으로 섹션 분리
// ---------------------------------------------------------------------------
interface Section {
  heading: string;
  content: string;
  level: number;
}

function splitByHeadings(markdown: string): Section[] {
  const lines = markdown.split('\n');
  const sections: Section[] = [];
  let current: Section | null = null;
  let contentLines: string[] = [];

  for (const line of lines) {
    const h2 = line.match(/^(#{1,3})\s+(.+)/);
    if (h2) {
      if (current) {
        current.content = contentLines.join('\n').trim();
        if (current.content.length > 10 || contentLines.length > 0) {
          sections.push(current);
        }
      }
      const level = h2[1].length;
      current = { heading: h2[2].trim(), content: '', level };
      contentLines = [];
    } else if (current) {
      contentLines.push(line);
    }
  }

  if (current) {
    current.content = contentLines.join('\n').trim();
    sections.push(current);
  }

  return sections;
}

// ---------------------------------------------------------------------------
// 메인 실행
// ---------------------------------------------------------------------------
async function main() {
  console.log('📖 Reading guidebook files...');

  if (!fs.existsSync(FULL_MD)) {
    console.error(`❌ Full MD not found: ${FULL_MD}`);
    console.log('ℹ️  가이드북 파일을 data/guidebook/ 폴더에 넣어주세요.');
    console.log('   이 스크립트는 파일 구조 생성만 담당합니다.');
    process.exit(1);
  }

  const fullContent = fs.readFileSync(FULL_MD, 'utf-8');

  // 출력 디렉토리 생성
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(DIR_OUT, { recursive: true });

  const sections = splitByHeadings(fullContent);
  console.log(`📑 Found ${sections.length} sections`);

  const canonicalPages: Array<{ slug: string; title: string; domain: string; pageType: string }> = [];
  const directoryEntries: Array<{
    name: string;
    entryType: string;
    category: string;
    description?: string;
    url?: string;
  }> = [];
  let skipped = 0;
  let written = 0;
  let dirCount = 0;

  for (const section of sections) {
    const { heading, content } = section;

    // 스킵: 너무 짧거나 의미 없음
    if (isStub(content)) {
      skipped++;
      continue;
    }

    // Directory 판별
    if (isDirectoryContent(content)) {
      // URL 추출
      const urls = [...content.matchAll(/https?:\/\/[^\s)>]+/g)].map((m) => m[0]);
      directoryEntries.push({
        name: heading,
        entryType: 'system_link',
        category: inferMeta(heading).domain,
        description: content.slice(0, 200),
        url: urls[0],
      });
      dirCount++;
      continue;
    }

    // Canonical 페이지 생성
    const slug = slugify(heading);
    const meta = inferMeta(heading);
    const frontmatter = buildFrontmatter(heading, slug, meta);
    const mdContent = `${frontmatter}\n\n${content}`;

    const outPath = path.join(OUT_DIR, `${slug}.md`);
    fs.writeFileSync(outPath, mdContent, 'utf-8');

    canonicalPages.push({ slug, title: heading, ...meta });
    written++;
  }

  // Directory JSON 저장
  const dirOutPath = path.join(DIR_OUT, 'guidebook-directory.json');
  fs.writeFileSync(dirOutPath, JSON.stringify(directoryEntries, null, 2), 'utf-8');

  // 요약 리포트
  const reportPath = path.join(OUT_DIR, '_canonicalize-report.json');
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        totalSections: sections.length,
        canonical: written,
        directory: dirCount,
        skipped,
        pages: canonicalPages,
      },
      null,
      2,
    ),
    'utf-8',
  );

  console.log('\n✅ Canonicalization complete:');
  console.log(`   📄 Canonical pages: ${written} → ${OUT_DIR}/`);
  console.log(`   🔗 Directory entries: ${dirCount} → ${dirOutPath}`);
  console.log(`   ⏭  Skipped (stub/empty): ${skipped}`);
  console.log(`   📊 Report: ${reportPath}`);
  console.log('\n다음 단계:');
  console.log('  1. data/canonical/ 페이지 품질 검토 (owner_team, page_type 수정)');
  console.log('  2. pnpm tsx scripts/seed-canonical.ts --dir data/canonical 로 Jarvis DB에 적재');
}

main().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});
