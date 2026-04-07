import { NextRequest, NextResponse } from "next/server";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import {
  createProjectInquirySchema,
  updateProjectInquiryStatusSchema
} from "@jarvis/shared/validation/project";
import { requireApiSession } from "@/lib/server/api-auth";
import {
  createProjectInquiry,
  listProjectInquiries,
  updateProjectInquiryStatus
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
  const rows = await listProjectInquiries({
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
  const parsed = createProjectInquirySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { projectId } = await context.params;
  const created = await createProjectInquiry({
    workspaceId: auth.session.workspaceId,
    projectId,
    authorId: auth.session.userId,
    input: parsed.data
  });

  if (!created) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ data: created }, { status: 201 });
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const auth = await requireApiSession(request, PERMISSIONS.PROJECT_UPDATE);
  if (auth.response) {
    return auth.response;
  }

  const body = await request.json();
  const parsed = updateProjectInquiryStatusSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { projectId } = await context.params;
  const updated = await updateProjectInquiryStatus({
    workspaceId: auth.session.workspaceId,
    projectId,
    input: parsed.data
  });

  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ data: updated });
}
