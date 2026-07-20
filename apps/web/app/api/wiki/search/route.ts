import { and, asc, eq, ilike, inArray, notInArray, or } from "drizzle-orm";
import { z } from "zod";
import { db, wikiPageIndex } from "@jarvis/db";
import { PERMISSIONS } from "@jarvis/shared";
import { withApiPermission } from "@/lib/server/api-auth";

const querySchema = z.object({
  q: z.string().trim().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(20).default(10),
});

const EXCLUDED = ["auto/index.md", "auto/log.md", "manual/index.md", "manual/log.md"];

export const GET = withApiPermission(PERMISSIONS.WIKI_READ, async (request, session) => {
  const params = new URL(request.url).searchParams;
  const parsed = querySchema.parse({
    q: params.get("q"),
    limit: params.get("limit"),
  });
  const keyword = `%${parsed.q}%`;
  const rows = await db
    .select({
      id: wikiPageIndex.id,
      title: wikiPageIndex.title,
      slug: wikiPageIndex.slug,
      path: wikiPageIndex.path,
      snippet: wikiPageIndex.snippet,
    })
    .from(wikiPageIndex)
    .where(
      and(
        eq(wikiPageIndex.workspaceId, session.workspaceId),
        inArray(wikiPageIndex.zone, ["auto", "manual"]),
        eq(wikiPageIndex.publishedStatus, "published"),
        notInArray(wikiPageIndex.path, EXCLUDED),
        or(ilike(wikiPageIndex.title, keyword), ilike(wikiPageIndex.slug, keyword)),
      ),
    )
    .orderBy(asc(wikiPageIndex.title))
    .limit(parsed.limit);

  return Response.json({ ok: true, rows }, { headers: { "Cache-Control": "no-store" } });
});
