import { NextRequest, NextResponse } from "next/server";
import { holidayRangeQuery } from "@jarvis/shared/validation/holidays";
import { listHolidays } from "@/lib/queries/holidays";
import { requireApiSession } from "@/lib/server/api-auth";

export async function GET(request: NextRequest) {
  const auth = await requireApiSession(request);
  if (auth.response) return auth.response;

  const parsed = holidayRangeQuery.safeParse({
    from: request.nextUrl.searchParams.get("from") ?? "",
    to: request.nextUrl.searchParams.get("to") ?? "",
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const fromYear = Number(parsed.data.from.slice(0, 4));
  const toYear = Number(parsed.data.to.slice(0, 4));
  const years = fromYear === toYear ? [fromYear] : [fromYear, toYear];
  const all: { id: string; date: string; name: string; note: string | null }[] = [];
  for (const year of years) {
    const rows = await listHolidays({ workspaceId: auth.session.workspaceId, year });
    for (const r of rows) {
      if (r.date >= parsed.data.from && r.date <= parsed.data.to) {
        all.push({ id: r.id, date: r.date, name: r.name, note: r.note ?? null });
      }
    }
  }
  return NextResponse.json({ holidays: all });
}
