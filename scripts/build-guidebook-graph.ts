#!/usr/bin/env tsx
// scripts/build-guidebook-graph.ts
// data/canonical/*.md -> guidebook-graph.json (rule-based relationship graph)
//
// 사용법:
//   pnpm tsx scripts/build-guidebook-graph.ts \
//     --dir data/canonical \
//     --out data/canonical/guidebook-graph.json
//
// 전제:
//   - canonicalize-guidebook.ts 실행 후 data/canonical/{slug}.md 존재

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

const DIR = getArg('--dir') ?? 'data/canonical';
const OUT = getArg('--out') ?? 'data/canonical/guidebook-graph.json';

// ---------------------------------------------------------------------------
// 타입 정의
// ---------------------------------------------------------------------------
interface GraphNode {
  id: string;
  label: string;
  type: 'page' | 'category' | 'team' | 'tool';
  domain?: string;
  pageType?: string;
}

interface GraphEdge {
  source: string;
  target: string;
  relation: string;
  weight: number;
}

interface Frontmatter {
  title: string;
  slug: string;
  domain: string;
  page_type: string;
  surface: string;
  authority: string;
  owner_team?: string;
  audience: string;
  source_key: string;
  [key: string]: unknown;
}

interface ParsedPage {
  frontmatter: Frontmatter;
  body: string;
  fileName: string;
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
// 도구 패턴 (USES_TOOL edge 생성용)
// ---------------------------------------------------------------------------
const TOOL_PATTERNS: Array<{ pattern: RegExp; toolId: string; toolLabel: string }> = [
  { pattern: /이수\s*HR/i, toolId: 'tool-isu-hr', toolLabel: '이수HR' },
  { pattern: /그룹웨어/i, toolId: 'tool-groupware', toolLabel: '그룹웨어' },
  { pattern: /ERP/i, toolId: 'tool-erp', toolLabel: 'ERP' },
  { pattern: /슬랙|Slack/i, toolId: 'tool-slack', toolLabel: 'Slack' },
  { pattern: /지라|Jira/i, toolId: 'tool-jira', toolLabel: 'Jira' },
  { pattern: /컨플루언스|Confluence/i, toolId: 'tool-confluence', toolLabel: 'Confluence' },
  { pattern: /github|GitHub/i, toolId: 'tool-github', toolLabel: 'GitHub' },
  { pattern: /줌|Zoom/i, toolId: 'tool-zoom', toolLabel: 'Zoom' },
];

// 양식/신청서 패턴 (REQUIRES_FORM edge 생성용)
const FORM_PATTERN = /(?:신청서|양식|서식)[\s\S]{0,60}(?:https?:\/\/[^\s)>]+|\[[^\]]+\]\([^)]+\))/g;
const FORM_URL_EXTRACT = /https?:\/\/[^\s)>]+/;

// ---------------------------------------------------------------------------
// 파일 로딩
// ---------------------------------------------------------------------------
function loadCanonicalFiles(dir: string): ParsedPage[] {
  if (!fs.existsSync(dir)) {
    throw new Error(`Directory not found: ${dir}`);
  }

  const files = fs.readdirSync(dir)
    .filter((f) => f.endsWith('.md') && !f.startsWith('_'));

  const result: ParsedPage[] = [];

  for (const fileName of files) {
    const filePath = path.resolve(dir, fileName);
    const raw = fs.readFileSync(filePath, 'utf-8');
    const { frontmatter, body } = parseFrontmatter(raw);

    const fm = frontmatter as Record<string, unknown>;
    if (!fm['title'] || !fm['slug']) {
      console.warn(`  [WARN] ${fileName}: missing required frontmatter fields (title/slug) -- skipping`);
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
        source_key: String(fm['source_key'] ?? ''),
      },
      body,
      fileName,
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// 그래프 빌드
// ---------------------------------------------------------------------------
function buildGraph(pages: ParsedPage[]): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodesMap = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];

  // 1) 페이지 노드 등록 + category/team 노드 자동 생성
  for (const page of pages) {
    const fm = page.frontmatter;

    // 페이지 노드
    nodesMap.set(fm.slug, {
      id: fm.slug,
      label: fm.title,
      type: 'page',
      domain: fm.domain,
      pageType: fm.page_type,
    });

    // 카테고리 노드 (domain)
    const catId = `cat-${fm.domain}`;
    if (!nodesMap.has(catId)) {
      nodesMap.set(catId, {
        id: catId,
        label: fm.domain,
        type: 'category',
      });
    }

    // 팀 노드 (owner_team)
    if (fm.owner_team) {
      const teamId = `team-${fm.owner_team}`;
      if (!nodesMap.has(teamId)) {
        nodesMap.set(teamId, {
          id: teamId,
          label: fm.owner_team,
          type: 'team',
        });
      }
    }
  }

  // 2) Edge 생성
  for (const page of pages) {
    const fm = page.frontmatter;

    // BELONGS_TO_DOMAIN
    edges.push({
      source: fm.slug,
      target: `cat-${fm.domain}`,
      relation: 'BELONGS_TO_DOMAIN',
      weight: 1.0,
    });

    // OWNED_BY
    if (fm.owner_team) {
      edges.push({
        source: fm.slug,
        target: `team-${fm.owner_team}`,
        relation: 'OWNED_BY',
        weight: 1.0,
      });
    }

    // USES_TOOL (본문에서 도구 패턴 매칭)
    for (const tool of TOOL_PATTERNS) {
      if (tool.pattern.test(page.body)) {
        // 도구 노드 등록
        if (!nodesMap.has(tool.toolId)) {
          nodesMap.set(tool.toolId, {
            id: tool.toolId,
            label: tool.toolLabel,
            type: 'tool',
          });
        }
        edges.push({
          source: fm.slug,
          target: tool.toolId,
          relation: 'USES_TOOL',
          weight: 0.7,
        });
      }
    }

    // REQUIRES_FORM (본문에서 양식/신청서 근처 링크 탐지)
    const formMatches = page.body.match(FORM_PATTERN);
    if (formMatches) {
      for (const match of formMatches) {
        const urlMatch = match.match(FORM_URL_EXTRACT);
        if (urlMatch) {
          const formId = `form-${fm.slug}-${edges.length}`;
          // form 엣지는 페이지 자체에 대한 속성으로 기록
          edges.push({
            source: fm.slug,
            target: fm.slug,
            relation: 'REQUIRES_FORM',
            weight: 0.6,
          });
        }
      }
    }
  }

  // 3) RELATED_TO (같은 domain / 같은 domain+page_type 페이지 간)
  const byDomain = new Map<string, ParsedPage[]>();
  for (const page of pages) {
    const d = page.frontmatter.domain;
    if (!byDomain.has(d)) byDomain.set(d, []);
    byDomain.get(d)!.push(page);
  }

  const relatedSeen = new Set<string>();
  for (const [, domainPages] of byDomain) {
    for (let i = 0; i < domainPages.length; i++) {
      for (let j = i + 1; j < domainPages.length; j++) {
        const a = domainPages[i].frontmatter;
        const b = domainPages[j].frontmatter;
        const pairKey = [a.slug, b.slug].sort().join('::');
        if (relatedSeen.has(pairKey)) continue;
        relatedSeen.add(pairKey);

        const samePageType = a.page_type === b.page_type;
        edges.push({
          source: a.slug,
          target: b.slug,
          relation: 'RELATED_TO',
          weight: samePageType ? 0.5 : 0.3,
        });
      }
    }
  }

  return {
    nodes: Array.from(nodesMap.values()),
    edges,
  };
}

// ---------------------------------------------------------------------------
// 메인 실행
// ---------------------------------------------------------------------------
function main(): void {
  console.log('='.repeat(60));
  console.log('Jarvis Guidebook Graph Builder');
  console.log(`  dir : ${DIR}`);
  console.log(`  out : ${OUT}`);
  console.log('='.repeat(60));

  const pages = loadCanonicalFiles(DIR);
  console.log(`\nLoaded ${pages.length} canonical page(s) from ${DIR}\n`);

  if (pages.length === 0) {
    console.log('No pages to process. Run canonicalize-guidebook.ts first.');
    process.exit(0);
  }

  const graph = buildGraph(pages);

  // 통계 계산
  const categoryCount = graph.nodes.filter((n) => n.type === 'category').length;
  const teamCount = graph.nodes.filter((n) => n.type === 'team').length;
  const toolCount = graph.nodes.filter((n) => n.type === 'tool').length;
  const pageCount = graph.nodes.filter((n) => n.type === 'page').length;

  // 출력 디렉토리 확보
  const outDir = path.dirname(OUT);
  fs.mkdirSync(outDir, { recursive: true });

  fs.writeFileSync(OUT, JSON.stringify(graph, null, 2), 'utf-8');

  console.log(`Nodes: ${graph.nodes.length}, Edges: ${graph.edges.length}, Categories: ${categoryCount}, Teams: ${teamCount}`);
  console.log(`  Pages: ${pageCount}, Tools: ${toolCount}`);
  console.log(`\nGraph written to ${OUT}`);
}

main();
