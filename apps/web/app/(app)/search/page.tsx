import { PERMISSIONS } from "@jarvis/shared";
import { searchEvidence } from "@jarvis/search";
import { PageHeader } from "@/components/patterns/PageHeader";
import { PageShell } from "@/components/patterns/PageShell";
import { requirePagePermission } from "@/lib/server/page-auth";
import { SearchFilters } from "./_components/SearchFilters";
import { SearchResults } from "./_components/SearchResults";

export default async function SearchPage(props: {
  searchParams: Promise<{ q?: string; asOf?: string; types?: string | string[] }>;
}) {
  const session = await requirePagePermission(PERMISSIONS.WIKI_READ, "/search");
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
      <PageHeader title="통합 검색" description="Projection metadata 기반 검색" />
      <SearchFilters q={q} asOf={asOf} types={types} />
      <div className="mt-6">
        <SearchResults rows={rows} />
      </div>
    </PageShell>
  );
}
