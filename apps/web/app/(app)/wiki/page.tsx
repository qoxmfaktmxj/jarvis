import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PERMISSIONS } from "@jarvis/shared";
import { PageHeader } from "@/components/patterns/PageHeader";
import { PageShell } from "@/components/patterns/PageShell";
import { listWikiPages, wikiPathToRoute } from "@/lib/server/wiki-page-loader";
import { requirePagePermission } from "@/lib/server/page-auth";

export default async function WikiIndexPage() {
  const session = await requirePagePermission(PERMISSIONS.WIKI_READ, "/wiki");
  const t = await getTranslations("Navigation");
  const rows = await listWikiPages({ workspaceId: session.workspaceId });

  return (
    <PageShell>
      <PageHeader title="HR Wiki" description={t("productName")} />
      <div className="grid gap-4">
        {rows.map((row) => (
          <Link
            key={row.id}
            href={wikiPathToRoute(row.path)}
            className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-page)] p-4 shadow-[var(--shadow-soft)]"
          >
            <h2 className="font-medium">{row.title}</h2>
            <p className="mt-2 text-sm text-[var(--fg-secondary)]">{row.snippet}</p>
          </Link>
        ))}
      </div>
    </PageShell>
  );
}
