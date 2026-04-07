import { NextRequest, NextResponse } from "next/server";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { createProjectSchema } from "@jarvis/shared/validation/project";
import { requireApiSession } from "@/lib/server/api-auth";
import {
  archiveProject,
  getProjectDetail,
  updateProject
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
  const detail = await getProjectDetail({
    workspaceId: auth.session.workspaceId,
    projectId
  });

  if (!detail) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ data: detail });
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const auth = await requireApiSession(request, PERMISSIONS.PROJECT_UPDATE);
  if (auth.response) {
    return auth.response;
  }

  const body = await request.json();
  const parsed = createProjectSchema.partial().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { projectId } = await context.params;
  const updated = await updateProject({
    workspaceId: auth.session.workspaceId,
    projectId,
    input: parsed.data
  });

  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ data: updated });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await requireApiSession(request, PERMISSIONS.PROJECT_DELETE);
  if (auth.response) {
    return auth.response;
  }

  const { projectId } = await context.params;
  const archived = await archiveProject({
    workspaceId: auth.session.workspaceId,
    projectId
  });

  if (!archived) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
