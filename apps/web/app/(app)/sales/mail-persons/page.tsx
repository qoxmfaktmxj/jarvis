import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { PageHeader } from "@/components/patterns/PageHeader";
import { MailPersonsGridContainer } from "./_components/MailPersonsGridContainer";
import { listMailPersons } from "./actions";

type SearchParams = {
  page?: string;
  searchMail?: string;
  name?: string;
  sabun?: string;
};

export default async function SalesMailPersonsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const headerStore = await headers();
  const sessionId = headerStore.get("x-session-id") ?? "";
  const session = await getSession(sessionId);
  if (!session || !hasPermission(session, PERMISSIONS.SALES_ALL)) redirect("/dashboard?error=forbidden");

  const params = await searchParams;
  const limit = 50;
  const page = Math.max(1, Number(params.page ?? 1));

  const listResult = await listMailPersons({
    page,
    limit,
    searchMail: params.searchMail || undefined,
    name: params.name || undefined,
    sabun: params.sabun || undefined,
  });
  const initialRows = !("error" in listResult) ? listResult.rows : [];
  const initialTotal = !("error" in listResult) ? listResult.total : 0;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Sales · Mail Persons" title="메일담당자" description="영업·인사 메일 수신 담당자를 관리합니다." />
      <MailPersonsGridContainer
        rows={initialRows}
        total={initialTotal}
        page={page}
        limit={limit}
        initialFilters={{
          searchMail: params.searchMail ?? "",
          name: params.name ?? "",
          sabun: params.sabun ?? "",
        }}
      />
    </div>
  );
}
