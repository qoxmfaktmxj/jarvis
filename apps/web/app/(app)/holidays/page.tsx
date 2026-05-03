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
    <div className="mx-auto max-w-[1000px] px-9 py-7">
      <PageHeader
        stamp="Holidays"
        kicker="Calendar"
        title="공휴일 관리"
        subtitle="토/일은 자동 처리되며, 법정 공휴일·대체휴일만 등록하세요."
      />
      <HolidaysGridContainer
        initialYear={year}
        initial={rows.map((r) => ({ id: r.id, date: r.date, name: r.name, note: r.note ?? null }))}
      />
    </div>
  );
}
