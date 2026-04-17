import type { WikiPageIndex } from "@jarvis/db/schema/wiki-page-index";
import type { WikiPage, WikiSensitivityUi } from "./types";

/**
 * apps/web/components/WikiPageView/mappers.ts
 *
 * Phase-W2 / Phase-W3 PR3 — DB row(WikiPageIndex) → UI(WikiPage) 매핑 단일 진입점.
 *
 * sensitivity 변환 규약 (4값 1:1 대응):
 *   PUBLIC          → public
 *   INTERNAL        → internal
 *   RESTRICTED      → restricted
 *   SECRET_REF_ONLY → secret
 *   알 수 없는 값   → restricted  (보수적 처리)
 */
export function mapDbSensitivity(db: string): WikiSensitivityUi {
  switch (db) {
    case "PUBLIC":
      return "public";
    case "INTERNAL":
      return "internal";
    case "RESTRICTED":
      return "restricted";
    case "SECRET_REF_ONLY":
      return "secret";
    default:
      return "restricted";
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
