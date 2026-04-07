import { NextRequest, NextResponse } from "next/server";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { createSystemSchema } from "@jarvis/shared/validation/system";
import {
  deleteSystem,
  getSystem,
  updateSystem
} from "@/lib/queries/systems";
import { requireApiSession } from "@/lib/server/api-auth";

type RouteContext = {
  params: Promise<{
    systemId: string;
  }>;
};

function normalizeSystemInput(input: ReturnType<typeof createSystemSchema.partial>["_output"]) {
  return {
    ...input,
    category: input.category || undefined,
    description: input.description || undefined,
    techStack: input.techStack || undefined,
    repositoryUrl: input.repositoryUrl || undefined,
    dashboardUrl: input.dashboardUrl || undefined
  };
}

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireApiSession(request, PERMISSIONS.SYSTEM_READ);
  if (auth.response) {
    return auth.response;
  }

  const { systemId } = await context.params;
  const detail = await getSystem({
    workspaceId: auth.session.workspaceId,
    systemId
  });

  if (!detail) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ data: detail });
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const auth = await requireApiSession(request, PERMISSIONS.SYSTEM_UPDATE);
  if (auth.response) {
    return auth.response;
  }

  const body = await request.json().catch(() => null);
  const parsed = createSystemSchema.partial().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const { systemId } = await context.params;
  const updated = await updateSystem({
    workspaceId: auth.session.workspaceId,
    systemId,
    input: normalizeSystemInput(parsed.data)
  });

  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ data: updated });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await requireApiSession(request, PERMISSIONS.SYSTEM_DELETE);
  if (auth.response) {
    return auth.response;
  }

  const { systemId } = await context.params;
  const deleted = await deleteSystem({
    workspaceId: auth.session.workspaceId,
    systemId
  });

  if (!deleted) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return new NextResponse(null, { status: 204 });
}
