import { NextRequest, NextResponse } from "next/server";
import { db } from "@jarvis/db/client";
import { auditLog } from "@jarvis/db/schema";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { writeAuditLog } from "@jarvis/shared/audit-log";
import { addStaffSchema } from "@jarvis/shared/validation/additional-dev";
import { addStaff, listStaff } from "@/lib/queries/additional-dev";
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
  const data = await listStaff({ addDevId: id, workspaceId: auth.session.workspaceId });

  return NextResponse.json({ data });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireApiSession(request, PERMISSIONS.ADDITIONAL_DEV_UPDATE);
  if (auth.response) {
    return auth.response;
  }

  const body = await request.json().catch(() => null);
  const parsed = addStaffSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const { id } = await context.params;
  const created = await addStaff({
    addDevId: id,
    workspaceId: auth.session.workspaceId,
    ...parsed.data,
  });

  const { ipAddress, userAgent } = extractRequestAudit(request);
  await writeAuditLog(db, auditLog, {
    workspaceId: auth.session.workspaceId,
    userId: auth.session.userId,
    action: "additional_development.staff.add",
    resourceType: "additional_development_staff",
    resourceId: created.id,
    ipAddress,
    userAgent,
    details: { addDevId: id, ...parsed.data },
  });

  return NextResponse.json({ data: created }, { status: 201 });
}
