import { NextRequest, NextResponse } from "next/server";
import { and, eq, ilike, or } from "drizzle-orm";
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
 * - title 또는 slug 에 ilike 로 부분 일치, publishedStatus='published' 로 한정.
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
  const pattern = `%${q}%`;

  const baseWhere = and(
    eq(wikiPageIndex.workspaceId, parsed.data.workspaceId),
    eq(wikiPageIndex.publishedStatus, "published"),
  );

  const where = q
    ? and(
        baseWhere,
        or(ilike(wikiPageIndex.title, pattern), ilike(wikiPageIndex.slug, pattern)),
      )
    : baseWhere;

  const rows = await db
    .select({
      slug: wikiPageIndex.slug,
      title: wikiPageIndex.title,
      path: wikiPageIndex.path,
    })
    .from(wikiPageIndex)
    .where(where)
    .limit(parsed.data.limit);

  return NextResponse.json({ pages: rows });
}
