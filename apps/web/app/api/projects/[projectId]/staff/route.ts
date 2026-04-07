import { NextRequest, NextResponse } from "next/server";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { assignProjectStaffSchema } from "@jarvis/shared/validation/project";
import { requireApiSession } from "@/lib/server/api-auth";
import {
  assignProjectStaff,
  listProjectStaff,
  removeProjectStaff
} from "@/lib/queries/projects";

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
  const rows = await listProjectStaff({
    workspaceId: auth.session.workspaceId,
    projectId
  });

  if (!rows) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ data: rows });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireApiSession(request, PERMISSIONS.PROJECT_UPDATE);
  if (auth.response) {
    return auth.response;
  }

  const body = await request.json();
  const parsed = assignProjectStaffSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { projectId } = await context.params;
  const created = await assignProjectStaff({
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

  const body = await request.json();
  const staffId = typeof body?.staffId === "string" ? body.staffId : null;
  if (!staffId) {
    return NextResponse.json({ error: "staffId required" }, { status: 400 });
  }

  const { projectId } = await context.params;
  const deleted = await removeProjectStaff({
    workspaceId: auth.session.workspaceId,
    projectId,
    staffId
  });

  if (!deleted) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
