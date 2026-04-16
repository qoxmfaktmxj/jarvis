import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { hasPermission } from "@jarvis/auth/rbac";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { SystemCard } from "@/components/system/SystemCard";
import { EmptyState } from "@/components/patterns/EmptyState";
import { PageHeader } from "@/components/patterns/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isoWeekNumber } from "@/lib/date-utils";
import { listSystems } from "@/lib/queries/systems";
import { requirePageSession } from "@/lib/server/page-auth";

export const dynamic = "force-dynamic";

type SearchParams = {
  page?: string;
  category?: string;
  environment?: string;
  status?: string;
  q?: string;
};

function parsePage(value?: string) {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export default async function SystemsPage({
  searchParams
}: {
  searchParams: Promise<SearchParams>;
}) {
  const t = await getTranslations("Systems");
  const session = await requirePageSession(PERMISSIONS.SYSTEM_READ, "/dashboard");
  const params = await searchParams;
  const page = parsePage(params.page);
  const result = await listSystems({
    workspaceId: session.workspaceId,
    page,
    pageSize: 24,
    category: params.category || undefined,
    environment: params.environment || undefined,
    status: params.status || undefined,
    q: params.q?.trim() || undefined
  });

  const canCreate = hasPermission(session, PERMISSIONS.SYSTEM_CREATE);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Systems"
        title={t("title")}
        description={t("description", { total: result.pagination.total })}
        accent={`W${isoWeekNumber(new Date())}`}
        meta={
          canCreate ? (
            <Button asChild>
              <Link href="/systems/new">{t("registerSystem")}</Link>
            </Button>
          ) : null
        }
      />

      <form className="grid gap-3 rounded-xl border border-surface-200 bg-card p-4 shadow-sm md:grid-cols-[1fr_180px_180px_auto]">
        <Input name="q" defaultValue={params.q} placeholder={t("searchPlaceholder")} />
        <select
          name="category"
          defaultValue={params.category ?? ""}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          <option value="">{t("allCategories")}</option>
          <option value="web">web</option>
          <option value="db">db</option>
          <option value="server">server</option>
          <option value="network">network</option>
          <option value="middleware">middleware</option>
        </select>
        <select
          name="environment"
          defaultValue={params.environment ?? ""}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          <option value="">{t("allEnvironments")}</option>
          <option value="prod">prod</option>
          <option value="staging">staging</option>
          <option value="dev">dev</option>
        </select>
        <Button type="submit" variant="outline">
          {t("applyFilters")}
        </Button>
      </form>

      {result.data.length === 0 ? (
        <EmptyState title={t("empty")} />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {result.data.map((system) => (
            <SystemCard key={system.id} system={system} />
          ))}
        </div>
      )}
    </div>
  );
}
