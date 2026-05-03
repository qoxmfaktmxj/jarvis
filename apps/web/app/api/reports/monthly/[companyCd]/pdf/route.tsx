import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@jarvis/db/client";
import { serviceDeskIncident } from "@jarvis/db/schema";
import { requirePermission } from "@/lib/server/action-auth";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { getDetail } from "@/lib/queries/month-report";
import { renderPdfFromReact } from "@/lib/pdf/render-pdf";
import { MonthlyReportTemplate, type MonthlyReportData } from "@/lib/pdf/monthly-report-template";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ companyCd: string }> },
) {
  const session = await requirePermission(PERMISSIONS.MONTH_REPORT_READ);
  const { companyCd } = await params;
  const ym = req.nextUrl.searchParams.get("ym");
  if (!ym || !/^\d{6}$/.test(ym)) {
    return NextResponse.json(
      { error: "ym query param required (YYYYMM)" },
      { status: 400 },
    );
  }

  let detail;
  try {
    detail = await getDetail(session.workspaceId, companyCd, ym);
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const yyyy = ym.substring(0, 4);
  const mm = ym.substring(4);

  const allIncidents = await db
    .select()
    .from(serviceDeskIncident)
    .where(
      and(
        eq(serviceDeskIncident.workspaceId, session.workspaceId),
        eq(serviceDeskIncident.enterCd, detail.master.enterCd),
        eq(serviceDeskIncident.yyyy, yyyy),
        eq(serviceDeskIncident.mm, mm),
        eq(serviceDeskIncident.requestCompanyCd, companyCd),
      ),
    );

  const processed = allIncidents.filter((i) =>
    ["3", "4", "9"].includes(i.statusCd ?? ""),
  );
  const unsolved = allIncidents.filter((i) =>
    ["1", "2"].includes(i.statusCd ?? ""),
  );

  // DB returns string | null for yn-columns; cast to the narrower "Y"|"N"|null
  // union that MonthlyReportData expects. Values are guaranteed to be Y/N at runtime.
  const master = detail.master as MonthlyReportData["master"];

  const pdfBuffer = await renderPdfFromReact(
    <MonthlyReportTemplate
      master={master}
      monthDetail={detail.monthDetail}
      otherDetail={detail.otherDetail}
      incidents={{ processed, unsolved }}
      ym={ym}
    />,
  );

  const filename = `${master.companyName}-${ym}.pdf`;
  return new NextResponse(pdfBuffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
    },
  });
}
