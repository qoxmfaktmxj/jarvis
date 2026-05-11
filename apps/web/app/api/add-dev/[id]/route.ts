import { NextRequest, NextResponse } from "next/server";
import { db } from "@jarvis/db/client";
import { auditLog } from "@jarvis/db/schema";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { writeAuditLog } from "@jarvis/shared/audit-log";
import { updateAdditionalDevSchema } from "@jarvis/shared/validation/additional-dev";
import {
  deleteAdditionalDev,
  getAdditionalDev,
  updateAdditionalDev,
} from "@/lib/queries/additional-dev";
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
  const row = await getAdditionalDev({
    workspaceId: auth.session.workspaceId,
    id,
  });

  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ data: row });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireApiSession(request, PERMISSIONS.ADDITIONAL_DEV_UPDATE);
  if (auth.response) {
    return auth.response;
  }

  const body = await request.json().catch(() => null);
  const parsed = updateAdditionalDevSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const { id } = await context.params;
  const before = await getAdditionalDev({
    workspaceId: auth.session.workspaceId,
    id,
  });
  const updated = await updateAdditionalDev({
    workspaceId: auth.session.workspaceId,
    id,
    input: parsed.data,
  });

  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { ipAddress, userAgent } = extractRequestAudit(request);
  await writeAuditLog(db, auditLog, {
    workspaceId: auth.session.workspaceId,
    userId: auth.session.userId,
    action: "additional_development.update",
    resourceType: "additional_development",
    resourceId: id,
    ipAddress,
    userAgent,
    before: before ?? undefined,
    after: parsed.data,
  });

  return NextResponse.json({ data: updated });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await requireApiSession(request, PERMISSIONS.ADDITIONAL_DEV_DELETE);
  if (auth.response) {
    return auth.response;
  }

  const { id } = await context.params;
  const deleted = await deleteAdditionalDev({
    workspaceId: auth.session.workspaceId,
    id,
  });

  if (!deleted) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { ipAddress, userAgent } = extractRequestAudit(request);
  await writeAuditLog(db, auditLog, {
    workspaceId: auth.session.workspaceId,
    userId: auth.session.userId,
    action: "additional_development.delete",
    resourceType: "additional_development",
    resourceId: id,
    ipAddress,
    userAgent,
  });

  return new NextResponse(null, { status: 204 });
}
