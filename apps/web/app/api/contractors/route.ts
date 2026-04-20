import { NextRequest, NextResponse } from "next/server";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { listContractors, createContractor } from "@/lib/queries/contractors";
import { requireApiSession } from "@/lib/server/api-auth";
import { listContractorsQuerySchema, createContractorBodySchema } from "./_schemas";

export async function GET(request: NextRequest) {
  const auth = await requireApiSession(request, PERMISSIONS.CONTRACTOR_READ);
  if (auth.response) return auth.response;

  const parsed = listContractorsQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams)
  );
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const isAdmin = auth.session.permissions.includes(PERMISSIONS.CONTRACTOR_ADMIN);
  const result = await listContractors({
    workspaceId: auth.session.workspaceId,
    userIdFilter: isAdmin ? undefined : auth.session.userId,
    ...parsed.data
  });

  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  const auth = await requireApiSession(request, PERMISSIONS.CONTRACTOR_ADMIN);
  if (auth.response) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = createContractorBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const created = await createContractor({
    workspaceId: auth.session.workspaceId,
    input: parsed.data,
    actorId: auth.session.userId
  });

  return NextResponse.json(created, { status: 201 });
}
