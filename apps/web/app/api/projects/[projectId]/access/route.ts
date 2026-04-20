import { NextRequest, NextResponse } from "next/server";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { createProjectAccessSchema } from "@jarvis/shared/validation/project";
import {
  createProjectAccess,
  deleteProjectAccess,
  listProjectAccessEntries
} from "@/lib/queries/projects";
import { requireApiSession } from "@/lib/server/api-auth";

type RouteContext = {
  params: Promise<{
    projectId: string;
  }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireApiSession(request, PERMISSIONS.PROJECT_READ);
  if (auth.response) {
    return auth.response;
  }

  const { projectId } = await context.params;
  const entries = await listProjectAccessEntries({
    workspaceId: auth.session.workspaceId,
    projectId,
    sessionRoles: auth.session.roles,
    sessionPermissions: auth.session.permissions
  });

  if (!entries) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ data: entries });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireApiSession(request, PERMISSIONS.PROJECT_UPDATE);
  if (auth.response) {
    return auth.response;
  }

  const body = await request.json().catch(() => null);
  const parsed = createProjectAccessSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const { projectId } = await context.params;
  const created = await createProjectAccess({
    workspaceId: auth.session.workspaceId,
    projectId,
    input: parsed.data
  });

  if (!created) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ data: created }, { status: 201 });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await requireApiSession(request, PERMISSIONS.PROJECT_UPDATE);
  if (auth.response) {
    return auth.response;
  }

  const accessId = request.nextUrl.searchParams.get("accessId");
  if (!accessId) {
    return NextResponse.json({ error: "accessId is required" }, { status: 400 });
  }

  const { projectId } = await context.params;
  const deleted = await deleteProjectAccess({
    workspaceId: auth.session.workspaceId,
    projectId,
    accessId
  });

  if (!deleted) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return new NextResponse(null, { status: 204 });
}
