import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { listHolidays } from "@/lib/queries/holidays";
import { HolidaysGridContainer } from "./_components/HolidaysGridContainer";
import { PageHeader } from "@/components/patterns/PageHeader";
import { requirePageSession } from "@/lib/server/page-auth";
import type { PageProps } from "@jarvis/shared/types/page";

export default async function HolidaysPage({ searchParams }: PageProps) {
  const session = await requirePageSession(PERMISSIONS.CONTRACTOR_ADMIN, "/dashboard");
  const sp = await searchParams;
  const year = typeof sp?.year === "string" ? Number(sp.year) : new Date().getFullYear();
  const rows = await listHolidays({ workspaceId: session.workspaceId, year });

  return (
    // 자체 mx-auto/max-w/padding 제거 — AppShellMain 전역 프레임이 처리.
    <div className="space-y-3">
      <PageHeader title="공휴일 관리" />
      <HolidaysGridContainer
        initialYear={year}
        initial={rows.map((r) => ({ id: r.id, date: r.date, name: r.name, note: r.note ?? null }))}
      />
    </div>
  );
}
