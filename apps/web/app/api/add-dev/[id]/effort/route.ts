import { NextRequest, NextResponse } from "next/server";
import { db } from "@jarvis/db/client";
import { auditLog } from "@jarvis/db/schema";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { writeAuditLog } from "@jarvis/shared/audit-log";
import { upsertEffortSchema } from "@jarvis/shared/validation/additional-dev";
import { listEfforts, upsertEffort } from "@/lib/queries/additional-dev";
import { requireApiSession } from "@/lib/server/api-auth";
import { extractRequestAudit } from "@/lib/server/request-audit";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireApiSession(request, PERMISSIONS.ADDITIONAL_DEV_READ);
  if (auth.response) {
    return auth.response;
  }

  const { id } = await context.params;
  const data = await listEfforts({ addDevId: id, workspaceId: auth.session.workspaceId });

  return NextResponse.json({ data });
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const auth = await requireApiSession(request, PERMISSIONS.ADDITIONAL_DEV_UPDATE);
  if (auth.response) {
    return auth.response;
  }

  const body = await request.json().catch(() => null);
  const parsed = upsertEffortSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const { id } = await context.params;
  await upsertEffort({
    addDevId: id,
    workspaceId: auth.session.workspaceId,
    yearMonth: parsed.data.yearMonth,
    effort: parsed.data.effort,
  });

  const { ipAddress, userAgent } = extractRequestAudit(request);
  await writeAuditLog(db, auditLog, {
    workspaceId: auth.session.workspaceId,
    userId: auth.session.userId,
    action: "additional_development.effort.upsert",
    resourceType: "additional_development_effort",
    resourceId: id,
    ipAddress,
    userAgent,
    details: { yearMonth: parsed.data.yearMonth, effort: parsed.data.effort },
  });

  return new NextResponse(null, { status: 204 });
}
