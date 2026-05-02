import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { getSession } from "@jarvis/auth/session";
import { getOrgTree, getCodesByGroup } from "@/lib/queries/admin";
import { listUsers } from "./actions";
import { UsersGridContainer } from "./_components/UsersGridContainer";
import { PageHeader } from "@/components/patterns/PageHeader";

function flattenTree(
  nodes: Array<{ id: string; name: string; children: typeof nodes }>,
  acc: Array<{ value: string; label: string }> = [],
) {
  for (const n of nodes) {
    acc.push({ value: n.id, label: n.name });
    flattenTree(n.children, acc);
  }
  return acc;
}

type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminUsersPage({ searchParams }: { searchParams?: SP }) {
  const t = await getTranslations("Admin.Users");
  const sp = (await searchParams) ?? {};
  const initialFilters = {
    q: typeof sp.q === "string" ? sp.q : "",
    status: typeof sp.status === "string" ? sp.status : "all",
    orgId: typeof sp.orgId === "string" ? sp.orgId : "",
  };

  const headersList = await headers();
  const session = await getSession(headersList.get("x-session-id") ?? "");
  if (!session) throw new Error("Unauthorized");

  const [users, orgTree, positionCodes, jobTitleCodes] = await Promise.all([
    listUsers({ ...initialFilters, page: 1, limit: 50 }),
    getOrgTree(session.workspaceId),
    getCodesByGroup(session.workspaceId, "POSITION"),
    getCodesByGroup(session.workspaceId, "JOB_TITLE"),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin · Users"
        title={t("title")}
        description={t("description")}
      />
      <UsersGridContainer
        initialRows={users.ok ? users.rows : []}
        initialTotal={users.ok ? users.total : 0}
        initialFilters={initialFilters}
        workspaceId={session.workspaceId}
        orgOptions={flattenTree(orgTree)}
        positionOptions={positionCodes.map((o) => ({ value: o.code, label: o.label }))}
        jobTitleOptions={jobTitleCodes.map((o) => ({ value: o.code, label: o.label }))}
      />
    </div>
  );
}
