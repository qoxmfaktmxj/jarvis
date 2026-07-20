import { GitRepo } from "@jarvis/wiki-fs";
import { PERMISSIONS } from "@jarvis/shared";
import { PageHeader } from "@/components/patterns/PageHeader";
import { PageShell } from "@/components/patterns/PageShell";
import { loadWikiPage, normalizeWikiRoutePath } from "@/lib/server/wiki-page-loader";
import { requirePagePermission } from "@/lib/server/page-auth";
import { ManualPageEditor } from "./_components/ManualPageEditor";

function requireWikiRepoRoot(): string {
  const value = process.env.WIKI_REPO_ROOT?.trim();
  if (!value) {
    throw new Error("WIKI_REPO_ROOT is required");
  }
  return value;
}

export default async function ManualWikiEditPage(props: { params: Promise<{ path: string[] }> }) {
  const session = await requirePagePermission(PERMISSIONS.WIKI_EDIT);
  const params = await props.params;
  const normalizedPath = normalizeWikiRoutePath(params.path);
  if (!normalizedPath.startsWith("manual/")) {
    throw new Error("MANUAL_PATH_REQUIRED");
  }

  let title = "";
  let body = "";
  let pageType: "concept" | "guide" | "case" | "source" = "guide";
  let publishedStatus: "draft" | "published" | "archived" = "draft";

  try {
    const page = await loadWikiPage({
      workspaceId: session.workspaceId,
      segments: params.path,
      repo: new GitRepo(requireWikiRepoRoot()),
    });
    title = page.title;
    body = page.body;
    pageType = page.pageType === "synthesis" ? "concept" : page.pageType;
    publishedStatus = page.frontmatter.publishedStatus as typeof publishedStatus;
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "WIKI_PAGE_NOT_FOUND") {
      throw error;
    }
    title = normalizedPath.replace(/^manual\//, "").replace(/\.md$/, "");
  }

  return (
    <PageShell>
      <PageHeader title="Manual Wiki Editor" description={normalizedPath} />
      <ManualPageEditor
        path={normalizedPath}
        title={title}
        body={body}
        pageType={pageType}
        publishedStatus={publishedStatus}
      />
    </PageShell>
  );
}
