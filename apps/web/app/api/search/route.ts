import { z } from "zod";
import { searchEvidence } from "@jarvis/search";
import { PERMISSIONS } from "@jarvis/shared";
import { withApiPermission } from "@/lib/server/api-auth";

const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(200),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(20).default(10),
  asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  types: z.array(z.enum(["wiki", "source", "legal_case"])).default(["wiki", "source", "legal_case"]),
});

export const GET = withApiPermission(PERMISSIONS.WIKI_READ, async (request, session) => {
  const searchParams = new URL(request.url).searchParams;
  const repeatedTypes = searchParams.getAll("types");
  const parsed = searchQuerySchema.parse({
    q: searchParams.get("q"),
    page: searchParams.get("page"),
    limit: searchParams.get("limit"),
    asOf: searchParams.get("asOf") ?? undefined,
    types: repeatedTypes.length > 0 ? repeatedTypes : undefined,
  });
  const rows = await searchEvidence({
    workspaceId: session.workspaceId,
    query: parsed.q,
    page: parsed.page,
    limit: parsed.limit,
    asOf: parsed.asOf,
    types: parsed.types,
  });
  return Response.json({ ok: true, rows }, { headers: { "Cache-Control": "no-store" } });
});
