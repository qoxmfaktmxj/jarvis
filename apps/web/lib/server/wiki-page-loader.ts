import { and, eq } from "drizzle-orm";
import { db } from "@jarvis/db/client";
import { wikiPageIndex, type WikiPageIndex } from "@jarvis/db/schema/wiki-page-index";
import {
  readUtf8,
  parseFrontmatter,
  type WikiFrontmatter,
} from "@jarvis/wiki-fs";
import { resolveWikiPath } from "./repo-root.js";

/**
 * apps/web/lib/server/wiki-page-loader.ts
 *
 * Phase-W2 C2 — wiki page 본문 로드.
 *
 * - SSoT 는 디스크. wikiPageIndex 는 색인/메타 전용.
 * - body 는 wikiPageIndex.path 를 통해 repo-root 기준으로 readUtf8.
 * - frontmatter / body 분리는 @jarvis/wiki-fs 의 parseFrontmatter 사용.
 * - sensitivity / 권한 체크는 호출자(page.tsx) 에서 수행 — 이 함수는 데이터만 반환.
 */
export interface LoadedWikiPage {
  meta: WikiPageIndex;
  /** 디스크에서 읽은 원본 markdown (frontmatter + body) */
  content: string;
  /** frontmatter 를 제외한 본문 markdown */
  bodyOnly: string;
  /** 파싱된 frontmatter (디스크 SSoT 기준) */
  frontmatter: WikiFrontmatter;
}

export async function loadWikiPageForView(
  workspaceId: string,
  slug: string,
): Promise<LoadedWikiPage | null> {
  const rows = await db
    .select()
    .from(wikiPageIndex)
    .where(
      and(
        eq(wikiPageIndex.workspaceId, workspaceId),
        eq(wikiPageIndex.slug, slug),
      ),
    )
    .limit(1);

  const meta = rows[0];
  if (!meta) return null;

  let content: string;
  try {
    content = await readUtf8(resolveWikiPath(meta.path));
  } catch {
    // 디스크 파일이 없거나 읽기 실패 — projection drift 로 간주하고 null 반환
    return null;
  }

  const { data: frontmatter, body } = parseFrontmatter(content);

  return {
    meta,
    content,
    bodyOnly: body,
    frontmatter,
  };
}
