import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { RevenueHeatmap } from "@/components/add-dev/RevenueHeatmap";
import { SectionHeader } from "@/components/patterns/SectionHeader";
import { listRevenues } from "@/lib/queries/additional-dev";
import { requirePageSession } from "@/lib/server/page-auth";

export const dynamic = "force-dynamic";

type SearchParams = { year?: string };

export default async function AddDevRevenuePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  await requirePageSession(PERMISSIONS.ADDITIONAL_DEV_READ, "/add-dev");
  const { id } = await params;
  const sp = await searchParams;

  const data = await listRevenues({ addDevId: id });

  const currentYear = new Date().getFullYear();
  const years = Array.from(
    new Set([
      currentYear - 1,
      currentYear,
      currentYear + 1,
      ...data.map((d) => Number(d.yearMonth.slice(0, 4))),
    ]),
  ).sort();

  const selectedYear = sp.year ? Number(sp.year) : currentYear;

  return (
    <div className="space-y-6">
      <SectionHeader title="매출">
        <form>
          <select
            name="year"
            defaultValue={String(selectedYear)}
            className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none"
          >
            {years.map((y) => (
              <option key={y} value={String(y)}>
                {y}년
              </option>
            ))}
          </select>
          <button type="submit" className="rounded-md bg-isu-600 px-3 py-1 text-sm text-white hover:bg-isu-700">적용</button>
        </form>
      </SectionHeader>

      <div className="overflow-x-auto rounded-md border border-surface-200 bg-white p-4">
        <RevenueHeatmap data={data} year={selectedYear} />
      </div>

      {data.length === 0 && (
        <p className="py-4 text-center text-sm text-surface-500">매출 데이터가 없습니다.</p>
      )}
    </div>
  );
}
