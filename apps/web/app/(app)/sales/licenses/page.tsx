import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { PageHeader } from "@/components/patterns/PageHeader";
import { LicensesGridContainer } from "./_components/LicensesGridContainer";
import { listLicenses, listLicenseCodes } from "./actions";

export default async function SalesLicensesPage() {
  const headerStore = await headers();
  const sessionId = headerStore.get("x-session-id") ?? "";
  const session = await getSession(sessionId);
  if (!session || !hasPermission(session, PERMISSIONS.SALES_ALL)) redirect("/dashboard?error=forbidden");

  const limit = 50;
  const [listResult, licenseKindOptions] = await Promise.all([
    listLicenses({ page: 1, limit }),
    listLicenseCodes(),
  ]);

  const initialRows = !("error" in listResult) ? listResult.rows : [];
  const initialTotal = !("error" in listResult) ? listResult.total : 0;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Sales · Licenses" title="라이센스관리" description="고객사별 라이센스 발급·만료를 관리합니다." />
      <LicensesGridContainer rows={initialRows} total={initialTotal} page={1} limit={limit} licenseKindOptions={licenseKindOptions} />
    </div>
  );
}
