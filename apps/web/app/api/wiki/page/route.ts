import { z } from "zod";
import { GitRepo } from "@jarvis/wiki-fs";
import { PERMISSIONS } from "@jarvis/shared";
import { withApiPermission } from "@/lib/server/api-auth";
import { loadWikiPage } from "@/lib/server/wiki-page-loader";

const querySchema = z.object({
  path: z.string().trim().min(1).max(500),
});

function requireWikiRepoRoot(): string {
  const value = process.env.WIKI_REPO_ROOT?.trim();
  if (!value) {
    throw new Error("WIKI_REPO_ROOT is required");
  }
  return value;
}

export const GET = withApiPermission(PERMISSIONS.WIKI_READ, async (request, session) => {
  const params = new URL(request.url).searchParams;
  const parsed = querySchema.parse({
    path: params.get("path"),
  });
  try {
    const page = await loadWikiPage({
      workspaceId: session.workspaceId,
      segments: parsed.path.replace(/\.md$/, "").split("/"),
      repo: new GitRepo(requireWikiRepoRoot()),
    });
    return Response.json({ ok: true, page }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "WIKI_PAGE_NOT_FOUND") {
      return Response.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
    }
    throw error;
  }
});
