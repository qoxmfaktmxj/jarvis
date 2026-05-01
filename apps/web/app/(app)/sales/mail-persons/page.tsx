import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { PageHeader } from "@/components/patterns/PageHeader";
import { MailPersonsGridContainer } from "./_components/MailPersonsGridContainer";
import { listMailPersons } from "./actions";

export default async function SalesMailPersonsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const headerStore = await headers();
  const sessionId = headerStore.get("x-session-id") ?? "";
  const session = await getSession(sessionId);
  if (!session || !hasPermission(session, PERMISSIONS.SALES_ALL)) redirect("/dashboard?error=forbidden");

  const limit = 50;
  const sp = searchParams ? await searchParams : {};
  const filters = {
    name: typeof sp.name === "string" ? sp.name : undefined,
    page: 1,
    limit,
  };

  const listResult = await listMailPersons(filters);
  const initialRows = !("error" in listResult) ? listResult.rows : [];
  const initialTotal = !("error" in listResult) ? listResult.total : 0;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Sales · Mail Persons" title="메일담당자" description="영업·인사 메일 수신 담당자를 관리합니다." />
      <MailPersonsGridContainer
        rows={initialRows}
        total={initialTotal}
        page={1}
        limit={limit}
        initialFilters={{ name: filters.name ?? "" }}
      />
    </div>
  );
}
