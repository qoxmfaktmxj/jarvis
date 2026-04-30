import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { ContractorTabs } from "@/components/contractors/ContractorTabs";
import { PageHeader } from "@/components/patterns/PageHeader";
import { requirePageSession } from "@/lib/server/page-auth";
import type { ReactNode } from "react";

export default async function ContractorsLayout({ children }: { children: ReactNode }) {
  await requirePageSession(PERMISSIONS.CONTRACTOR_READ, "/dashboard");

  return (
    <div style={{ padding: "28px 36px", maxWidth: 1400, margin: "0 auto" }}>
      <PageHeader
        kicker="Workforce"
        title="외주인력관리"
        subtitle="외주인력 계약·연차·일정을 관리합니다."
      />
      <ContractorTabs />
      {children}
    </div>
  );
}
