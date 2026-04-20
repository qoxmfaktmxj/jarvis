import { NextRequest, NextResponse } from "next/server";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { canAccessContractorData } from "@jarvis/auth/rbac";
import { db } from "@jarvis/db/client";
import { leaveRequest } from "@jarvis/db/schema";
import { and, eq } from "drizzle-orm";
import {
  updateLeaveRequest,
  cancelLeaveRequest,
  deleteLeaveRequest
} from "@/lib/queries/contractors";
import { getHolidaySetForRange } from "@/lib/queries/holidays";
import { requireApiSession } from "@/lib/server/api-auth";
import { updateLeaveBodySchema } from "../../contractors/_schemas";
import { isValidUuid } from "@jarvis/shared/validation";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: NextRequest, ctx: RouteContext) {
  const auth = await requireApiSession(request, PERMISSIONS.CONTRACTOR_READ);
  if (auth.response) return auth.response;

  const { id } = await ctx.params;
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const [existing] = await db
    .select({ userId: leaveRequest.userId, startDate: leaveRequest.startDate, endDate: leaveRequest.endDate })
    .from(leaveRequest)
    .where(and(eq(leaveRequest.id, id), eq(leaveRequest.workspaceId, auth.session.workspaceId)))
    .limit(1);
  if (!existing) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (!canAccessContractorData(auth.session, existing.userId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = updateLeaveBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const fromDate = parsed.data.startDate ?? String(existing.startDate);
  const toDate = parsed.data.endDate ?? String(existing.endDate);
  const holidays = await getHolidaySetForRange({
    workspaceId: auth.session.workspaceId,
    from: fromDate,
    to: toDate
  });

  const updated = await updateLeaveRequest({
    workspaceId: auth.session.workspaceId,
    id,
    patch: parsed.data,
    holidays
  });

  return NextResponse.json(updated);
}

export async function DELETE(request: NextRequest, ctx: RouteContext) {
  const auth = await requireApiSession(request, PERMISSIONS.CONTRACTOR_READ);
  if (auth.response) return auth.response;

  const { id } = await ctx.params;
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const [existing] = await db
    .select({ userId: leaveRequest.userId })
    .from(leaveRequest)
    .where(and(eq(leaveRequest.id, id), eq(leaveRequest.workspaceId, auth.session.workspaceId)))
    .limit(1);
  if (!existing) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (!canAccessContractorData(auth.session, existing.userId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = request.nextUrl;
  const hard = url.searchParams.get("hard") === "1";

  if (hard && auth.session.permissions.includes(PERMISSIONS.CONTRACTOR_ADMIN)) {
    await deleteLeaveRequest({ workspaceId: auth.session.workspaceId, id });
  } else {
    await cancelLeaveRequest({ workspaceId: auth.session.workspaceId, id });
  }

  return NextResponse.json({ ok: true });
}
