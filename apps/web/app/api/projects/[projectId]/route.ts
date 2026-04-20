import { NextRequest, NextResponse } from "next/server";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { z } from "zod";
import {
  deleteProject,
  getProject,
  updateProject
} from "@/lib/queries/projects";
import { requireApiSession } from "@/lib/server/api-auth";

type RouteContext = {
  params: Promise<{
    projectId: string;
  }>;
};

const updateProjectBodySchema = z.object({
  name: z.string().min(1).max(300).optional(),
  description: z.string().max(4000).optional().or(z.literal("")),
  sensitivity: z.enum(["PUBLIC", "INTERNAL", "RESTRICTED", "SECRET_REF_ONLY"]).optional(),
  status: z.enum(["active", "deprecated", "decommissioned"]).optional(),
  prodDomainUrl: z.string().url().optional().or(z.literal("")),
  prodConnectType: z.enum(["IP", "VPN", "VDI", "RE"]).optional(),
  prodRepositoryUrl: z.string().url().optional().or(z.literal("")),
  devDomainUrl: z.string().url().optional().or(z.literal("")),
  devConnectType: z.enum(["IP", "VPN", "VDI", "RE"]).optional(),
  devRepositoryUrl: z.string().url().optional().or(z.literal(""))
});

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireApiSession(request, PERMISSIONS.PROJECT_READ);
  if (auth.response) {
    return auth.response;
  }

  const { projectId } = await context.params;
  const detail = await getProject({
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

  const body = await request.json().catch(() => null);
  const parsed = updateProjectBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const { projectId } = await context.params;
  const updated = await updateProject({
    workspaceId: auth.session.workspaceId,
    projectId,
    input: {
      ...parsed.data,
      description: parsed.data.description || undefined,
      prodDomainUrl: parsed.data.prodDomainUrl || undefined,
      prodRepositoryUrl: parsed.data.prodRepositoryUrl || undefined,
      devDomainUrl: parsed.data.devDomainUrl || undefined,
      devRepositoryUrl: parsed.data.devRepositoryUrl || undefined
    }
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
  const deleted = await deleteProject({
    workspaceId: auth.session.workspaceId,
    projectId
  });

  if (!deleted) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return new NextResponse(null, { status: 204 });
}
