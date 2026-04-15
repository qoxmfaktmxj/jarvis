import type { WikiPageIndex } from "@jarvis/db/schema/wiki-page-index";
import type { WikiPage, WikiSensitivityUi } from "./types";

/**
 * apps/web/components/WikiPageView/mappers.ts
 *
 * Phase-W2 — DB row(WikiPageIndex) → UI(WikiPage) 매핑 단일 진입점.
 *
 * sensitivity 변환 규약:
 *   PUBLIC          → public
 *   INTERNAL        → internal
 *   RESTRICTED      → confidential  (UI 단계에서는 두 값을 묶어 처리, Phase-W2 한정)
 *   SECRET_REF_ONLY → confidential  (본문 접근은 호출자에서 별도 차단)
 *   알 수 없는 값   → confidential  (보수적 처리)
 */
export function mapDbSensitivity(db: string): WikiSensitivityUi {
  switch (db) {
    case "PUBLIC":
      return "public";
    case "INTERNAL":
      return "internal";
    case "RESTRICTED":
    case "SECRET_REF_ONLY":
      return "confidential";
    default:
      return "confidential";
  }
}

export function mapDbRowToWikiPage(row: WikiPageIndex, body: string): WikiPage {
  const fmTags = (row.frontmatter as { tags?: unknown } | undefined)?.tags;
  const tags =
    Array.isArray(fmTags) && fmTags.every((t) => typeof t === "string")
      ? (fmTags as string[])
      : [];
  return {
    slug: row.slug,
    title: row.title,
    sensitivity: mapDbSensitivity(row.sensitivity),
    tags,
    updatedAt: row.updatedAt.toISOString(),
    workspaceId: row.workspaceId,
    content: body,
  };
}
