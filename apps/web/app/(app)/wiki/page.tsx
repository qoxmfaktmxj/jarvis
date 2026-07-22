import { getTranslations } from "next-intl/server";
import { PERMISSIONS } from "@jarvis/shared";
import { PageHeader } from "@/components/patterns/PageHeader";
import { PageShellFit } from "@/components/patterns/PageShell";
import { listWikiPages, wikiPathToRoute } from "@/lib/server/wiki-page-loader";
import { requirePagePermission } from "@/lib/server/page-auth";
import { WikiIndexShell } from "./_components/WikiIndexShell";

const WIKI_PAGE_SIZE = 20;

export default async function WikiIndexPage(props: {
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const session = await requirePagePermission(PERMISSIONS.WIKI_READ, "/wiki");
  const t = await getTranslations("Wiki.Index");
  const searchParams = await props.searchParams;
  const rawPage = Array.isArray(searchParams.page) ? searchParams.page[0] : searchParams.page;
  const parsedPage = Number(rawPage);
  const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const result = await listWikiPages({ workspaceId: session.workspaceId, page, limit: WIKI_PAGE_SIZE });

  return (
    <PageShellFit>
      <PageHeader title={t("title")} description={t("description")} />
      <WikiIndexShell
        rows={result.rows.map((row) => ({
          id: row.id,
          title: row.title,
          path: row.path,
          href: wikiPathToRoute(row.path),
          snippet: row.snippet,
        }))}
        total={result.total}
        page={result.page}
        totalPages={result.totalPages}
      />
    </PageShellFit>
  );
}
