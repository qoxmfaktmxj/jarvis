import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { listHolidays } from "@/lib/queries/holidays";
import { HolidayTable } from "@/components/holidays/HolidayTable";
import { PageHeader } from "@/components/patterns/PageHeader";
import { requirePageSession } from "@/lib/server/page-auth";
import type { PageProps } from "@jarvis/shared/types/page";

export const metadata = { title: "공휴일 관리" };
export const dynamic = "force-dynamic";

export default async function HolidaysPage({ searchParams }: PageProps) {
  const session = await requirePageSession(
    PERMISSIONS.CONTRACTOR_ADMIN,
    "/dashboard"
  );

  const sp = await searchParams;
  const year =
    typeof sp?.year === "string" ? Number(sp.year) : new Date().getFullYear();
  const rows = await listHolidays({ workspaceId: session.workspaceId, year });

  return (
    <div style={{ padding: "28px 36px", maxWidth: 1000, margin: "0 auto" }}>
      <PageHeader
        stamp="Holidays"
        kicker="Calendar"
        title="공휴일 관리"
        subtitle="토/일은 자동 처리되며, 법정 공휴일·대체휴일만 등록하세요."
      />
      <HolidayTable
        initialYear={year}
        initialRows={rows.map((r) => ({
          id: r.id,
          date: r.date,
          name: r.name,
          note: r.note,
        }))}
      />
    </div>
  );
}
