import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { listHolidays, createHoliday } from "@/lib/queries/holidays";
import { requireApiSession } from "@/lib/server/api-auth";

const querySchema = z.object({
  year: z.coerce.number().int().min(1900).max(3000).optional()
});

const bodySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  name: z.string().min(1).max(100),
  note: z.string().max(1000).optional()
});

export async function GET(request: NextRequest) {
  const auth = await requireApiSession(request, PERMISSIONS.CONTRACTOR_READ);
  if (auth.response) return auth.response;

  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const rows = await listHolidays({ workspaceId: auth.session.workspaceId, year: parsed.data.year });
  return NextResponse.json({ data: rows });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiSession(request, PERMISSIONS.CONTRACTOR_ADMIN);
  if (auth.response) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const created = await createHoliday({ workspaceId: auth.session.workspaceId, input: parsed.data });
    return NextResponse.json(created, { status: 201 });
  } catch (e: unknown) {
    if (String((e as { message?: string })?.message ?? "").toLowerCase().includes("unique")) {
      return NextResponse.json({ error: "duplicate" }, { status: 409 });
    }
    throw e;
  }
}
