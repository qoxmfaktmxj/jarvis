import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { hasPermission } from "@jarvis/auth/rbac";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { AddDevTable } from "@/components/add-dev/AddDevTable";
import { PageHeader } from "@/components/patterns/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listAdditionalDev } from "@/lib/queries/additional-dev";
import { requirePageSession } from "@/lib/server/page-auth";

export const dynamic = "force-dynamic";

type SearchParams = {
  page?: string;
  pageSize?: string;
  status?: string;
  part?: string;
  q?: string;
  projectId?: string;
};

function parsePage(value?: string) {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export default async function AddDevListPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const t = await getTranslations("AdditionalDev");
  const session = await requirePageSession(PERMISSIONS.ADDITIONAL_DEV_READ, "/dashboard");
  const params = await searchParams;
  const page = parsePage(params.page);

  const result = await listAdditionalDev({
    workspaceId: session.workspaceId,
    page,
    pageSize: 20,
    projectId: params.projectId || undefined,
    status: params.status || undefined,
    part: params.part || undefined,
    q: params.q?.trim() || undefined,
  });

  const canCreate = hasPermission(session, PERMISSIONS.ADDITIONAL_DEV_CREATE);

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Add-Dev"
        title={t("title")}
        subtitle={t("subtitle", { total: result.pagination.total })}
        actions={
          canCreate ? (
            <Button asChild>
              <Link href="/add-dev/new">{t("newAddDev")}</Link>
            </Button>
          ) : null
        }
      />

      <form className="grid gap-3 rounded-xl border border-surface-200 bg-card p-4 shadow-sm md:grid-cols-[1fr_160px_160px_auto]">
        <Input name="q" defaultValue={params.q} placeholder={t("searchPlaceholder")} />
        <select
          name="status"
          defaultValue={params.status ?? ""}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          <option value="">{t("allStatuses")}</option>
          <option value="협의중">협의중</option>
          <option value="진행중">진행중</option>
          <option value="완료">완료</option>
          <option value="보류">보류</option>
        </select>
        <select
          name="part"
          defaultValue={params.part ?? ""}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          <option value="">{t("allParts")}</option>
          <option value="Saas">Saas</option>
          <option value="외부">외부</option>
          <option value="모바일">모바일</option>
          <option value="채용">채용</option>
        </select>
        <Button type="submit" variant="outline">
          {t("applyFilters")}
        </Button>
      </form>

      <AddDevTable data={result.data} />
    </div>
  );
}
