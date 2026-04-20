import { NextRequest, NextResponse } from "next/server";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { upsertRevenueSchema } from "@jarvis/shared/validation/additional-dev";
import { listRevenues, upsertRevenue } from "@/lib/queries/additional-dev";
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
  const data = await listRevenues({ addDevId: id });

  return NextResponse.json({ data });
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const auth = await requireApiSession(request, PERMISSIONS.ADDITIONAL_DEV_UPDATE);
  if (auth.response) {
    return auth.response;
  }

  const body = await request.json().catch(() => null);
  const parsed = upsertRevenueSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const { id } = await context.params;
  await upsertRevenue({
    addDevId: id,
    yearMonth: parsed.data.yearMonth,
    amount: parsed.data.amount,
  });

  return new NextResponse(null, { status: 204 });
}
