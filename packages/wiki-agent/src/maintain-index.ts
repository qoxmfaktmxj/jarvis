export interface WikiPageMeta {
  slug: string;
  title: string;
  path: string;
  summary?: string;
}

export interface MaintainIndexOptions {
  generatedAt?: Date;
  workspaceCode?: string;
}

type CategoryKey = "manual" | "auto" | "other";

const CATEGORY_LABELS: Record<CategoryKey, string> = {
  manual: "수동 작성 (manual)",
  auto: "자동 생성 (auto)",
  other: "기타 (other)",
};

function categorize(path: string): CategoryKey {
  const [first] = path.split("/");
  if (first === "manual") return "manual";
  if (first === "auto") return "auto";
  return "other";
}

function renderPage(page: WikiPageMeta): string {
  const summary = page.summary?.trim();
  return summary ? `- [[${page.slug}]] — ${page.title} — ${summary}` : `- [[${page.slug}]] — ${page.title}`;
}

export function buildIndexMarkdown(
  pages: WikiPageMeta[],
  options: MaintainIndexOptions = {},
): string {
  const generatedAt = options.generatedAt ?? new Date();
  const workspaceCode = options.workspaceCode ?? "public-demo";
  const grouped = new Map<CategoryKey, WikiPageMeta[]>();

  for (const page of pages) {
    const key = categorize(page.path);
    const list = grouped.get(key);
    if (list) list.push(page);
    else grouped.set(key, [page]);
  }

  const sections: string[] = [];
  for (const key of ["manual", "auto", "other"] as const) {
    const list = grouped.get(key);
    if (!list || list.length === 0) continue;
    const lines = [...list]
      .sort((left, right) => left.title.localeCompare(right.title, "ko"))
      .map(renderPage)
      .join("\n");
    sections.push(`## ${CATEGORY_LABELS[key]} — ${list.length}\n\n${lines}\n`);
  }

  return [
    "---",
    `generated_at: ${generatedAt.toISOString()}`,
    `page_count: ${pages.length}`,
    `workspace: ${workspaceCode}`,
    "---",
    "",
    `# ${workspaceCode} 위키 인덱스`,
    "",
    ...sections,
  ].join("\n");
}
