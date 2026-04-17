import fs from 'fs';
import path from 'path';

const BASE = process.cwd();
const data = JSON.parse(fs.readFileSync(path.join(BASE, 'data/cases/company_batches/batch_02.json'), 'utf8'));

function fmt(val, fallback = 'N/A') {
  if (val === null || val === undefined) return fallback;
  return String(val);
}

function fmtRate(val) {
  if (val === null || val === undefined) return 'N/A';
  if (typeof val === 'number') {
    if (val <= 1) return (val * 100).toFixed(1) + '%';
    return val.toFixed(1) + '%';
  }
  return String(val);
}

function severityStr(dist) {
  if (!dist) return 'N/A';
  return Object.entries(dist).map(([k, v]) => `${k}: ${v}`).join(', ');
}

function buildPage(c) {
  const topModuleLabels = (c.top_modules || []).slice(0, 5).map(m => m.label || `${m.higher}/${m.lower}`);
  const timeRange = fmt(c.time_range);
  const meanWH = c.mean_work_hours !== null && c.mean_work_hours !== undefined ? String(c.mean_work_hours) : 'null';
  const resolvedRate = c.resolved_rate !== null && c.resolved_rate !== undefined ? c.resolved_rate : null;

  // frontmatter
  const fm = [
    '---',
    `title: "${c.company} — 서비스데스크 패턴 요약"`,
    'type: synthesis',
    'authority: auto',
    'sensitivity: INTERNAL',
    'domain: cases',
    `tags: ["domain/cases", "company", "company/${c.company_slug}"]`,
    'cases:',
    `  company: "${c.company}"`,
    `  caseCount: ${c.case_count}`,
    `  topModules: [${topModuleLabels.map(l => `"${l}"`).join(', ')}]`,
    `  meanWorkHours: ${meanWH}`,
    `  resolvedRate: ${resolvedRate !== null ? resolvedRate : 'null'}`,
    `  timeRange: "${timeRange}"`,
    '---',
  ].join('\n');

  // 헤더 통계
  const header = [
    `# ${c.company}`,
    '',
    '## 헤더 통계',
    `- 총 문의: ${c.case_count}`,
    `- 기간: ${timeRange}`,
    `- 평균 work_hours: ${meanWH}`,
    `- 해결률: ${fmtRate(resolvedRate)}`,
    `- severity 분포: ${severityStr(c.severity_dist)}`,
  ].join('\n');

  // 주요 모듈
  const modRows = (c.top_modules || []).map(m => {
    const label = m.lower ? `${m.higher} / ${m.lower}` : (m.label || String(m));
    return `| ${label} | ${m.count} |`;
  }).join('\n');
  const moduleSec = [
    '',
    '## 주요 모듈',
    '| 모듈 (higher / lower) | 건수 |',
    '|---|---:|',
    modRows || '| (데이터 없음) | - |',
  ].join('\n');

  // 주요 클러스터 TOP 10
  const clusters = (c.top_clusters || []).slice(0, 10);
  const clusterLines = clusters.map(cl =>
    `- cluster-${cl.cluster_id}: ${cl.label} — ${cl.count_in_company}건 (전체 ${cl.total_case_count}건)`
  ).join('\n');
  const clusterSec = [
    '',
    '## 주요 클러스터 TOP 10',
    clusterLines || '- (데이터 없음)',
  ].join('\n');

  // 자주 쓰는 메뉴
  const menus = (c.top_menus || []).join(', ');
  const menuSec = [
    '',
    '## 자주 쓰는 메뉴',
    `- ${menus || '(데이터 없음)'}`,
  ].join('\n');

  // 대표 사례
  const samples = (c.samples || []).slice(0, 5);
  const sampleLines = samples.map(s => {
    const title = s.title ? s.title.slice(0, 40) : '(제목 없음)';
    return `- \`${s.source_key}\` — ${title}`;
  }).join('\n');
  const sampleSec = [
    '',
    '## 대표 사례',
    sampleLines || '- (데이터 없음)',
  ].join('\n');

  // 특이 패턴 (LLM 노트) — data-driven synthesis from samples and module dist
  const noteSec = [
    '',
    '## 특이 패턴 (LLM 노트)',
    buildNote(c),
  ].join('\n');

  return [fm, header, moduleSec, clusterSec, menuSec, sampleSec, noteSec].join('\n') + '\n';
}

function buildNote(c) {
  const mods = (c.top_modules || []);
  const topMod = mods[0];
  const samples = (c.samples || []);
  const cats = [...new Set(samples.map(s => s.lower_category).filter(Boolean))];

  if (!topMod && samples.length === 0) {
    return '이 회사는 일반 모듈 분포를 따릅니다.';
  }

  const lines = [];

  // Top module pattern
  if (topMod) {
    const topLabel = topMod.lower || topMod.label || topMod.higher;
    const topCount = topMod.count;
    const total = c.case_count;
    const pct = total ? ((topCount / total) * 100).toFixed(0) : '?';
    lines.push(`주요 문의는 ${topLabel} 모듈에 집중(${topCount}건, 전체의 ${pct}%)되어 있으며, ` +
      `${mods.length > 1 ? mods.slice(1, 3).map(m => m.lower || m.label).join('·') + ' 순으로 이어진다' : '단일 모듈 집중도가 높다'}.`);
  }

  // Sample pattern
  if (cats.length > 0) {
    lines.push(`대표 사례에서는 ${cats.join(', ')} 관련 요청이 고르게 나타난다.`);
  }

  // Resolved rate note
  if (c.resolved_rate !== null && c.resolved_rate !== undefined) {
    const rate = c.resolved_rate <= 1 ? (c.resolved_rate * 100).toFixed(0) : c.resolved_rate.toFixed(0);
    if (Number(rate) >= 95) {
      lines.push(`해결률 ${rate}%로 대부분의 문의가 완결 처리되었다.`);
    } else if (Number(rate) < 80) {
      lines.push(`해결률 ${rate}%로 미처리 비율이 상대적으로 높아 후속 모니터링이 필요하다.`);
    }
  }

  if (lines.length === 0) return '이 회사는 일반 모듈 분포를 따릅니다.';
  return lines.join(' ');
}

let written = 0;
for (const c of data) {
  const outPath = path.join(BASE, c.output_path);
  const dir = path.dirname(outPath);
  fs.mkdirSync(dir, { recursive: true });
  const content = buildPage(c);
  fs.writeFileSync(outPath, content, 'utf8');
  written++;
  console.log(`[${written}] Written: ${c.output_path}`);
}

console.log(`\ncompany_batch_02: ${written} pages written`);
