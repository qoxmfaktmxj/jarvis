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
 * - publishedStatus='published' 필터 — draft/archived 는 뷰어 페이지에서 숨김.
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
        eq(wikiPageIndex.publishedStatus, "published"),
      ),
    )
    .limit(1);

  const meta = rows[0];
  if (!meta) return null;

  let content: string;
  try {
    content = await readUtf8(resolveWikiPath(meta.path));
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      // 파일이 없음 — projection drift로 간주하고 null 반환.
      // silent swallow 가 아니라 운영 관찰성을 위해 warn 으로 남긴다.
      console.warn(
        "[wiki-page-loader] projection drift: file missing for",
        { workspaceId, slug, path: meta.path },
      );
      return null;
    }
    // EACCES, EIO 등 디스크/권한 오류는 500으로 전파
    console.error("[wiki-page-loader] disk read failed:", err);
    throw err;
  }

  const { data: frontmatter, body } = parseFrontmatter(content);

  return {
    meta,
    content,
    bodyOnly: body,
    frontmatter,
  };
}
