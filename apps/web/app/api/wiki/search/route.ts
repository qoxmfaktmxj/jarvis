import { NextRequest, NextResponse } from "next/server";
import { and, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@jarvis/db/client";
import { wikiPageIndex } from "@jarvis/db/schema/wiki-page-index";
import { PERMISSIONS } from "@jarvis/shared/constants";
import { wikiSearchQuerySchema } from "@jarvis/shared/validation";
import { requireApiSession } from "@/lib/server/api-auth";

/**
 * GET /api/wiki/search?workspaceId=...&q=...&limit=6
 *
 * Phase-W2 — WikiEditor `[[wikilink]]` autocomplete.
 *
 * - 권한: KNOWLEDGE_READ
 * - workspace 일치 검증: 세션의 workspaceId 와 쿼리의 workspaceId 가 다르면 403.
 * - title, slug, aliases, path 에 ilike 부분 일치, publishedStatus='published'.
 * - 응답에 path 미포함 (디렉터리 구조 노출 방지).
 *
 * Sensitivity 격리는 RBAC + workspaceId 모델로 일원화되었다
 * (2026-05-11 sensitivity 제거 step 2A).
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await requireApiSession(req, PERMISSIONS.KNOWLEDGE_READ);
  if (auth.response) return auth.response;
  const { session } = auth;

  const url = new URL(req.url);
  const workspaceIdParam = url.searchParams.get("workspaceId") ?? "";
  const qParam = url.searchParams.get("q") ?? "";
  const limitRaw = url.searchParams.get("limit");
  const limitNum = limitRaw ? Number.parseInt(limitRaw, 10) : 6;

  const parsed = wikiSearchQuerySchema.safeParse({
    workspaceId: workspaceIdParam,
    q: qParam,
    limit: Number.isFinite(limitNum) ? limitNum : 6,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // workspace cross-tenant 차단
  if (parsed.data.workspaceId !== session.workspaceId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const q = parsed.data.q.trim();

  // 빈 쿼리는 전체 목록 노출을 막기 위해 즉시 빈 결과 반환
  if (!q) {
    return NextResponse.json({ pages: [] });
  }

  // LIKE 와일드카드 이스케이프 (%, _, \) — ilike 파라미터화와 별도로 필요
  const escaped = q.replace(/[\\%_]/g, "\\$&");
  const pattern = `%${escaped}%`;

  const where = and(
    eq(wikiPageIndex.workspaceId, parsed.data.workspaceId),
    eq(wikiPageIndex.publishedStatus, "published"),
    or(
      ilike(wikiPageIndex.title, pattern),
      ilike(wikiPageIndex.slug, pattern),
      // Search aliases in frontmatter JSONB
      sql`${wikiPageIndex.frontmatter}->>'aliases' ILIKE ${pattern}`,
      // Search in path (e.g. "hr/leave-policy")
      ilike(wikiPageIndex.path, pattern),
    ),
  );

  const rows = await db
    .select({
      slug: wikiPageIndex.slug,
      title: wikiPageIndex.title,
      routeKey: wikiPageIndex.routeKey,
    })
    .from(wikiPageIndex)
    .where(where)
    .limit(parsed.data.limit);

  return NextResponse.json({ pages: rows });
}
