import { NextRequest, NextResponse } from "next/server";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { createSystemAccessSchema } from "@jarvis/shared/validation/system";
import {
  createSystemAccess,
  deleteSystemAccess,
  listSystemAccessEntries
} from "@/lib/queries/systems";
import { requireApiSession } from "@/lib/server/api-auth";

type RouteContext = {
  params: Promise<{
    systemId: string;
  }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireApiSession(request, PERMISSIONS.SYSTEM_READ);
  if (auth.response) {
    return auth.response;
  }

  const { systemId } = await context.params;
  const entries = await listSystemAccessEntries({
    workspaceId: auth.session.workspaceId,
    systemId,
    sessionRoles: auth.session.roles,
    sessionPermissions: auth.session.permissions
  });

  if (!entries) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ data: entries });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireApiSession(request, PERMISSIONS.SYSTEM_UPDATE);
  if (auth.response) {
    return auth.response;
  }

  const body = await request.json().catch(() => null);
  const parsed = createSystemAccessSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const { systemId } = await context.params;
  const created = await createSystemAccess({
    workspaceId: auth.session.workspaceId,
    systemId,
    input: parsed.data
  });

  if (!created) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ data: created }, { status: 201 });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await requireApiSession(request, PERMISSIONS.SYSTEM_UPDATE);
  if (auth.response) {
    return auth.response;
  }

  const accessId = request.nextUrl.searchParams.get("accessId");
  if (!accessId) {
    return NextResponse.json({ error: "accessId is required" }, { status: 400 });
  }

  const { systemId } = await context.params;
  const deleted = await deleteSystemAccess({
    workspaceId: auth.session.workspaceId,
    systemId,
    accessId
  });

  if (!deleted) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return new NextResponse(null, { status: 204 });
}
