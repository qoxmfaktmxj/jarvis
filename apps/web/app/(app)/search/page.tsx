import { PERMISSIONS } from "@jarvis/shared";
import { searchEvidence } from "@jarvis/search";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/patterns/PageHeader";
import { PageShell } from "@/components/patterns/PageShell";
import { requirePagePermission } from "@/lib/server/page-auth";
import { SearchExperience } from "./_components/SearchExperience";

export default async function SearchPage(props: {
  searchParams: Promise<{ q?: string; asOf?: string; types?: string | string[] }>;
}) {
  const session = await requirePagePermission(PERMISSIONS.WIKI_READ, "/search");
  const t = await getTranslations("Search.Page");
  const searchParams = await props.searchParams;
  const q = typeof searchParams.q === "string" ? searchParams.q : "";
  const asOf = typeof searchParams.asOf === "string" ? searchParams.asOf : "";
  const typesInput = Array.isArray(searchParams.types)
    ? searchParams.types
    : typeof searchParams.types === "string"
      ? searchParams.types.split(",")
      : ["wiki", "source", "legal_case"];

  const types = typesInput.filter(
    (value): value is "wiki" | "source" | "legal_case" => value === "wiki" || value === "source" || value === "legal_case",
  );

  const rows =
    q.trim().length > 0
      ? await searchEvidence({
          workspaceId: session.workspaceId,
          query: q,
          asOf: asOf || undefined,
          types: types.length > 0 ? types : ["wiki", "source", "legal_case"],
          page: 1,
          limit: 20,
        })
      : [];

  return (
    <PageShell>
      <PageHeader title={t("title")} description={t("description")} />
      <SearchExperience
        initialQuery={q}
        initialRows={rows}
        labels={{
          inputLabel: t("inputLabel"),
          placeholder: t("placeholder"),
          clear: t("clear"),
          loading: t("loading"),
          empty: t("empty"),
        }}
      />
    </PageShell>
  );
}
