import { hasPermission } from "@jarvis/auth/rbac";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { listContractors } from "@/lib/queries/contractors";
import { ContractorTable } from "@/components/contractors/ContractorTable";
import { requirePageSession } from "@/lib/server/page-auth";
import type { PageProps } from "@jarvis/shared/types/page";

export const metadata = { title: "외주인력관리" };
export const dynamic = "force-dynamic";

export default async function ContractorsRosterPage({ searchParams }: PageProps) {
  const session = await requirePageSession(PERMISSIONS.CONTRACTOR_READ, "/dashboard");

  const sp = await searchParams;
  const q = typeof sp?.q === "string" ? sp.q : undefined;
  const status =
    typeof sp?.status === "string" &&
    ["active", "expired", "terminated"].includes(sp.status)
      ? (sp.status as "active" | "expired" | "terminated")
      : "active";

  const isAdmin = hasPermission(session, PERMISSIONS.CONTRACTOR_ADMIN);
  const result = await listContractors({
    workspaceId: session.workspaceId,
    q,
    status,
    page: 1,
    pageSize: 100
  });
  const data = isAdmin
    ? result.data
    : result.data.filter((r) => r.userId === session.userId);

  return (
    <ContractorTable
      initialData={data.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() }))}
      isAdmin={isAdmin}
      initialQuery={{ q, status }}
    />
  );
}
