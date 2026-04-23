// packages/wiki-agent/src/maintain-index.ts
//
// Phase C1 — wiki/index.md 자동 유지 (Karpathy LLM Wiki §indexing).
//
// 역할: 페이지 메타 리스트를 받아 **인덱스 마크다운 문자열**을 만든다.
// 파일 쓰기는 caller(wiki-fs) 담당. 이 모듈은 순수 함수 — 네트워크/파일
// 시스템/DB I/O 없음. 테스트가 간단해지고 wiki-agent 패키지 원칙 유지.
//
// 인덱스 용도:
//   - LLM(ask-agent) 이 wiki_grep 으로 후보를 찾기 어려울 때 참고
//   - 카테고리별 페이지 분포 한눈에 파악
//   - 새 페이지 추가 시 카테고리에 자동 포함
//
// 포맷(예):
//
//   ---
//   generated_at: 2026-04-23T12:00:00.000Z
//   page_count: 1331
//   workspace: jarvis
//   ---
//
//   # Jarvis 위키 인덱스
//
//   ## 수동 작성 (manual) — 523
//   - [[loan-interest-limit]] — 사내대출 이자 한도 — 연 2.5%, 무주택 0.5%p 우대
//   ...

export interface WikiPageMeta {
  slug: string;
  title: string;
  /** repo-relative path: "wiki/<code>/<category>/.../<file>.md" */
  path: string;
  /** frontmatter summary 또는 첫 줄. 없으면 생략. */
  summary?: string;
  /** RBAC filter 는 caller 가 이미 적용했다고 가정. 메타로만 보유. */
  sensitivity?: string;
  /** canonical / derived / community — 미사용이지만 보존 */
  authority?: "canonical" | "derived" | "community";
}

export interface MaintainIndexOptions {
  generatedAt?: Date;
  workspaceCode?: string;
}

type CategoryKey = "manual" | "auto" | "procedures" | "references" | "other";

interface CategoryDef {
  key: CategoryKey;
  heading: string;
}

const CATEGORY_ORDER: CategoryDef[] = [
  { key: "manual", heading: "수동 작성 (manual)" },
  { key: "auto", heading: "자동 생성 (auto)" },
  { key: "procedures", heading: "절차 (procedures)" },
  { key: "references", heading: "참고 자료 (references)" },
  { key: "other", heading: "기타 (other)" },
];

function categorize(path: string, workspaceCode: string): CategoryKey {
  const prefix = `wiki/${workspaceCode}/`;
  if (!path.startsWith(prefix)) return "other";
  const rel = path.slice(prefix.length);
  const top = rel.split("/")[0] ?? "";
  switch (top) {
    case "manual":
      return "manual";
    case "auto":
      return "auto";
    case "procedures":
      return "procedures";
    case "references":
      return "references";
    default:
      return "other";
  }
}

function renderPageLine(p: WikiPageMeta): string {
  const title = p.title.trim();
  const summary = (p.summary ?? "").trim();
  return summary.length > 0
    ? `- [[${p.slug}]] — ${title} — ${summary}`
    : `- [[${p.slug}]] — ${title}`;
}

function renderFrontmatter(
  pageCount: number,
  workspace: string,
  generatedAt: Date,
): string {
  return [
    "---",
    `generated_at: ${generatedAt.toISOString()}`,
    `page_count: ${pageCount}`,
    `workspace: ${workspace}`,
    "---",
    "",
  ].join("\n");
}

export function buildIndexMarkdown(
  pages: WikiPageMeta[],
  options: MaintainIndexOptions = {},
): string {
  const workspaceCode = options.workspaceCode ?? "jarvis";
  const generatedAt = options.generatedAt ?? new Date();

  const frontmatter = renderFrontmatter(pages.length, workspaceCode, generatedAt);
  const header = [
    `# ${capitalize(workspaceCode)} 위키 인덱스`,
    "",
    `총 ${pages.length.toLocaleString("en-US")} 페이지. LLM(ask-agent) 이 wiki_grep 으로 후보를 찾기 어려울 때 이 파일을 참고한다.`,
    "",
  ].join("\n");

  if (pages.length === 0) {
    return `${frontmatter}\n${header}(페이지 없음)\n`;
  }

  const grouped = new Map<CategoryKey, WikiPageMeta[]>();
  for (const p of pages) {
    const key = categorize(p.path, workspaceCode);
    const arr = grouped.get(key);
    if (arr) arr.push(p);
    else grouped.set(key, [p]);
  }

  const sections: string[] = [];
  for (const cat of CATEGORY_ORDER) {
    const list = grouped.get(cat.key);
    if (!list || list.length === 0) continue;
    const sorted = [...list].sort((a, b) => a.title.localeCompare(b.title, "ko"));
    const lines = sorted.map(renderPageLine).join("\n");
    sections.push(`## ${cat.heading} — ${list.length}\n\n${lines}\n`);
  }

  return `${frontmatter}\n${header}${sections.join("\n")}`;
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
