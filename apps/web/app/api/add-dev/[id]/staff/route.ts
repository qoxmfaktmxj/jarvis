import { NextRequest, NextResponse } from "next/server";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { addStaffSchema } from "@jarvis/shared/validation/additional-dev";
import { addStaff, listStaff } from "@/lib/queries/additional-dev";
import { requireApiSession } from "@/lib/server/api-auth";

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

  return NextResponse.json({ data: created }, { status: 201 });
}
