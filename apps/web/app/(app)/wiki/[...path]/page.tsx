import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { GitRepo } from "@jarvis/wiki-fs";
import { PERMISSIONS } from "@jarvis/shared";
import { PageHeader } from "@/components/patterns/PageHeader";
import { PageShell } from "@/components/patterns/PageShell";
import { SourceRefCard } from "@/components/ai/SourceRefCard";
import { loadPublishedWikiPage } from "@/lib/server/wiki-page-loader";
import { requirePagePermission } from "@/lib/server/page-auth";

function requireWikiRepoRoot(): string {
  const value = process.env.WIKI_REPO_ROOT?.trim();
  if (!value) {
    throw new Error("WIKI_REPO_ROOT is required");
  }
  return value;
}

export default async function WikiDetailPage(props: { params: Promise<{ path: string[] }> }) {
  const session = await requirePagePermission(PERMISSIONS.WIKI_READ);
  const params = await props.params;

  try {
    const page = await loadPublishedWikiPage({
      workspaceId: session.workspaceId,
      segments: params.path,
      repo: new GitRepo(requireWikiRepoRoot()),
    });

    return (
      <PageShell>
        <PageHeader title={page.title} description={page.path} />
        <article className="prose max-w-none rounded-lg border border-[var(--border-default)] bg-[var(--bg-page)] p-5 shadow-[var(--shadow-soft)]">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{page.body}</ReactMarkdown>
        </article>
        {page.citations.length > 0 ? (
          <section className="mt-6 grid gap-3 md:grid-cols-2">
            {page.citations.map((citation) => (
              <SourceRefCard
                key={`${citation.sourceRevisionId}-${citation.locator}`}
                source={{
                  kind: "source",
                  label: citation.title,
                  title: citation.title,
                  locator: citation.locator,
                  effectiveFrom: citation.effectiveFrom,
                  canonicalUrl: citation.canonicalUrl,
                }}
              />
            ))}
          </section>
        ) : null}
      </PageShell>
    );
  } catch (error) {
    if (error instanceof Error && error.message === "WIKI_PAGE_NOT_FOUND") {
      notFound();
    }
    throw error;
  }
}
