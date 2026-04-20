import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { updateHoliday, deleteHoliday } from "@/lib/queries/holidays";
import { requireApiSession } from "@/lib/server/api-auth";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const patchSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  name: z.string().min(1).max(100).optional(),
  note: z.string().max(1000).optional()
});

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireApiSession(request, PERMISSIONS.CONTRACTOR_ADMIN);
  if (auth.response) return auth.response;

  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const updated = await updateHoliday({ workspaceId: auth.session.workspaceId, id, patch: parsed.data });
  if (!updated) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await requireApiSession(request, PERMISSIONS.CONTRACTOR_ADMIN);
  if (auth.response) return auth.response;

  const { id } = await context.params;
  const deleted = await deleteHoliday({ workspaceId: auth.session.workspaceId, id });
  if (!deleted) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
