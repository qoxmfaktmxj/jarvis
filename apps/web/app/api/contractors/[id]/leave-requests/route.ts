import { NextRequest, NextResponse } from "next/server";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { canAccessContractorData } from "@jarvis/auth/rbac";
import { listLeaveRequests, createLeaveRequest } from "@/lib/queries/contractors";
import { getHolidaySetForRange } from "@/lib/queries/holidays";
import { requireApiSession } from "@/lib/server/api-auth";
import { createLeaveBodySchema } from "../../_schemas";
import { isValidUuid } from "@jarvis/shared/validation";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, ctx: RouteContext) {
  const auth = await requireApiSession(request, PERMISSIONS.CONTRACTOR_READ);
  if (auth.response) return auth.response;

  const { id } = await ctx.params;
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  if (!canAccessContractorData(auth.session, id)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = request.nextUrl;
  const from = url.searchParams.get("from") ?? undefined;
  const to = url.searchParams.get("to") ?? undefined;
  const status = (url.searchParams.get("status") as "approved" | "cancelled" | null) ?? "approved";

  const rows = await listLeaveRequests({
    workspaceId: auth.session.workspaceId,
    userId: id,
    from,
    to,
    status
  });

  return NextResponse.json({ data: rows });
}

export async function POST(request: NextRequest, ctx: RouteContext) {
  const auth = await requireApiSession(request, PERMISSIONS.CONTRACTOR_READ);
  if (auth.response) return auth.response;

  const { id } = await ctx.params;
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  if (!canAccessContractorData(auth.session, id)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createLeaveBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const holidays = await getHolidaySetForRange({
    workspaceId: auth.session.workspaceId,
    from: parsed.data.startDate,
    to: parsed.data.endDate
  });

  try {
    const created = await createLeaveRequest({
      workspaceId: auth.session.workspaceId,
      userId: id,
      input: parsed.data,
      actorId: auth.session.userId,
      holidays
    });
    return NextResponse.json(created, { status: 201 });
  } catch (e: unknown) {
    if (e instanceof Error && (e as Error & { code?: string }).code === "NO_ACTIVE_CONTRACT") {
      return NextResponse.json({ error: "no_active_contract" }, { status: 409 });
    }
    throw e;
  }
}
